import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2, Users, Target, Activity, X, Search, Download, FileText, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Dashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Status edit modal state
  const [isEditStatusOpen, setIsEditStatusOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'responses'));
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setData(docs);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'responses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-emerald-500">
        <Loader2 className="animate-spin mb-4" size={32} />
        <p className="text-sm font-medium text-gray-400">Carregando métricas...</p>
      </div>
    );
  }

  // Filter data based on search
  const filteredData = data.filter(member => 
    member.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    member.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Active members only for calculations
  const activeMembers = filteredData.filter(m => m.status !== 'Ex-membro');
  const activeCount = activeMembers.length;
  const totalCount = filteredData.length;
  
  // Active Projects Calculation (rough estimate based on splitting strings)
  const allProjects = new Set();
  activeMembers.forEach(m => {
    if (m.currentProjects) {
      m.currentProjects.split(',').map((p: string) => p.trim()).filter((p: string) => p).forEach((p: string) => allProjects.add(p.toLowerCase()));
    }
  });
  const totalActiveProjects = allProjects.size;

  const avgLeagueFocus = activeCount ? (activeMembers.reduce((acc, curr) => acc + (curr.leagueFocus || 0), 0) / activeCount).toFixed(1) : '0';
  const avgProgress = activeCount ? Math.round(activeMembers.reduce((acc, curr) => acc + (curr.progress || 0), 0) / activeCount) : 0;

  // Roles distribution for chart (active only)
  const rolesCount = activeMembers.reduce((acc: any, curr) => {
    acc[curr.leagueRole] = (acc[curr.leagueRole] || 0) + 1;
    return acc;
  }, {});
  
  const chartData = Object.keys(rolesCount).map(role => ({
    name: role,
    Membros: rolesCount[role]
  }));

  const handleAuthorizeEdit = async (member: any, approved: boolean) => {
    try {
      const history = member.editHistory || [];
      history.push({ action: approved ? 'Aprovado' : 'Recusado', timestamp: Date.now() });
      
      const updateData = approved ? {
        editAuthorized: true,
        editRequestStatus: null,
        editHistory: history
      } : {
        editAuthorized: false,
        editRequestStatus: 'rejected',
        editHistory: history
      };
      
      await updateDoc(doc(db, 'responses', member.id), updateData);
      toast.success(approved ? 'Edição autorizada com sucesso!' : 'Edição recusada com sucesso!');
      fetchData();
      setSelectedMember({ ...member, ...updateData });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar solicitação de edição');
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ['Data', 'Nome', 'Email', 'Curso', 'Período', 'Área', 'Dedicação Semanal', 'Foco na Função', 'Projetos Atuais', 'Status', 'Motivo Exclusão'];
      const csvRows = [headers.join(',')];
      
      filteredData.forEach(row => {
        const values = [
          new Date(row.createdAt).toLocaleDateString(),
          `"${row.name || ''}"`,
          `"${row.email || ''}"`,
          `"${row.course || ''}"`,
          `"${row.period || ''}"`,
          `"${row.leagueRole || ''}"`,
          `"${row.weeklyHours || ''}"`,
          `"${row.roleFocus || ''}"`,
          `"${row.currentProjects || ''}"`,
          `"${row.status || 'Ativo'}"`,
          `"${row.deletionReason || ''}"`
        ];
        csvRows.push(values.join(','));
      });
      
      const csvData = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const csvUrl = URL.createObjectURL(csvData);
      const link = document.createElement('a');
      link.href = csvUrl;
      link.download = `laje_membros_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
      link.click();
      toast.success('CSV exportado com sucesso');
    } catch (err) {
      toast.error('Erro ao exportar CSV');
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text('Relatório de Membros LAJE HR', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 30);
      
      const tableData = filteredData.map(row => [
        row.name || '-',
        row.leagueRole || '-',
        row.currentProjects || '-',
        row.status || 'Ativo',
        `${row.progress || 0}%`
      ]);

      autoTable(doc, {
        head: [['Nome', 'Área', 'Projetos', 'Status', 'Progresso']],
        body: tableData,
        startY: 40,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] }
      });
      
      doc.save(`laje_relatorio_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
      toast.success('PDF exportado com sucesso');
    } catch (err) {
      toast.error('Erro ao exportar PDF');
    }
  };

  const handleChangeStatus = async () => {
    if (!selectedMember) return;
    setIsUpdatingStatus(true);
    
    try {
      const newStatus = selectedMember.status === 'Ex-membro' ? 'Ativo' : 'Ex-membro';
      const updateData: any = { status: newStatus };
      
      if (newStatus === 'Ex-membro') {
        if (!deletionReason.trim()) {
          toast.error('Por favor, insira o motivo da exclusão');
          setIsUpdatingStatus(false);
          return;
        }
        updateData.deletionReason = deletionReason;
      } else {
        updateData.deletionReason = null;
      }
      
      await updateDoc(doc(db, 'responses', selectedMember.id), updateData);
      
      // Update local state
      setSelectedMember({ ...selectedMember, ...updateData });
      setData(data.map(m => m.id === selectedMember.id ? { ...m, ...updateData } : m));
      
      toast.success(`Membro marcado como ${newStatus}`);
      setIsEditStatusOpen(false);
      setDeletionReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'responses');
      toast.error('Erro ao atualizar status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!selectedMember || deleteConfirmation.trim().toUpperCase() !== 'EXCLUIR') return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'responses', selectedMember.id));
      setData(data.filter(member => member.id !== selectedMember.id));
      setSelectedMember(null);
      setIsDeleteConfirmOpen(false);
      setDeleteConfirmation('');
      toast.success('Registro excluído permanentemente');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'responses');
      toast.error('Erro ao excluir o registro');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 pb-12">
      {/* Search Bar */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 text-[var(--color-ink)]" size={20} />
        <input 
          type="text" 
          placeholder="PESQUISAR POR NOME OU E-MAIL..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full max-w-[500px] bg-transparent border border-[var(--color-ink-faint)] py-[14px] pl-[44px] pr-[14px] text-[var(--color-ink)] font-['Space_Mono'] text-[0.85rem] outline-none focus:border-[var(--color-accent)] uppercase transition-colors"
        />
      </div>

      {/* Chart Top */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]  ">
          <h3 className="text-white font-semibold mb-6">Membros por Categoria</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#1f2937' }}
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#10b981', fontWeight: 600 }}
                />
                <Bar dataKey="Membros" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#10b981" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]   flex flex-col justify-between">
          <div>
            <h3 className="text-white font-semibold mb-6">Resumo Estatístico</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-\[var(--color-ink-faint)\]">
                <span className="text-gray-400 font-medium">Total de Cadastros</span>
                <span className="text-white font-bold text-xl">{totalCount}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-\[var(--color-ink-faint)\]">
                <span className="text-gray-400 font-medium">Projetos Ativos</span>
                <span className="text-emerald-400 font-bold text-xl">{totalActiveProjects}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-6">
            <button 
              onClick={handleExportPDF}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium  transition-colors border border-gray-700"
            >
              <FileText size={16} />
              Exportar para PDF
            </button>
            <button 
              onClick={handleExportCSV}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium  transition-colors border border-gray-700"
            >
              <Download size={16} />
              Exportar para CSV
            </button>
          </div>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]   flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Membros Ativos</p>
            <p className="text-3xl font-bold text-white">{activeCount}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 ">
            <Users size={28} />
          </div>
        </div>
        <div className="p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]   flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Foco Médio (Liga)</p>
            <p className="text-3xl font-bold text-white">{avgLeagueFocus} <span className="text-sm text-gray-500 font-medium">/ 5</span></p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 ">
            <Target size={28} />
          </div>
        </div>
        <div className="p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]   flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Progresso Médio</p>
            <p className="text-3xl font-bold text-white">{avgProgress}%</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 ">
            <Activity size={28} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Latest Responses */}
        <div className="p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]   flex flex-col">
          <h3 className="text-white font-semibold mb-6">Transmissões Recentes</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {filteredData.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">Nenhum dado encontrado.</p>
            ) : (
              filteredData.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(response => (
                <div key={response.id} onClick={() => setSelectedMember(response)} className="p-4 bg-gray-800/50 border border-gray-700/50  flex justify-between items-center cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/20 hover:border-emerald-500/50 hover:bg-gray-800 transition-all duration-300 group">
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">{response.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      <span className="font-medium text-emerald-500">{response.leagueRole}</span> • {response.currentProjects || 'Sem projeto'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${response.progress}%` }} />
                      </div>
                      <p className="text-xs font-bold text-gray-300">{response.progress}%</p>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">{new Date(response.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Full Data Table */}
      <div className="p-6 bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\]   overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white font-semibold">Registro de Atualizações (RH)</h3>
          <p className="text-sm text-gray-400">Clique em um membro para detalhes</p>
        </div>
        <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-gray-950 border-b border-\[var(--color-ink-faint)\]">
              <tr>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Data</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Membro</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Status</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Curso/Período</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Área/Papel</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Projetos</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Progresso</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Prioridade</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Solicitação de Edição</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Data de Alteração</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.sort((a, b) => b.createdAt - a.createdAt).map(response => (
                <tr key={response.id} onClick={() => setSelectedMember(response)} className="border-b border-\[var(--color-ink-faint)\] cursor-pointer hover:bg-gray-800/80 hover:scale-[1.01] z-0 hover:z-10 relative hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-300 group">
                  <td className="px-2 py-3  text-gray-400 text-xs">{new Date(response.createdAt).toLocaleDateString()}</td>
                  <td className="px-2 py-3">
                    <div className="font-semibold text-gray-200 group-hover:text-emerald-400 transition-colors">{response.name}</div>
                    <div className="text-xs text-emerald-500/80">{response.email}</div>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-block whitespace-nowrap text-center min-w-[75px] px-2 py-1 text-xs font-medium  ${response.status === 'Ex-membro' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {response.status || 'Ativo'}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="text-gray-300">{response.course}</div>
                    <div className="text-xs text-gray-500">{response.period}</div>
                  </td>
                  <td className="px-2 py-3">
                    <span className="px-2.5 py-1 text-xs font-medium  bg-gray-800 text-gray-300">{response.leagueRole}</span>
                  </td>
                  <td className="px-2 py-3 max-w-[150px] truncate text-gray-300" title={response.currentProjects}>{response.currentProjects || '-'}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-200 font-bold min-w-[3ch] text-xs">{response.progress}%</span>
                      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${response.progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3  text-xs">
                    <div className="flex justify-between w-16 mb-1 text-gray-400">Liga: <span className="font-semibold text-gray-200">{response.leagueFocus}</span></div>
                    <div className="flex justify-between w-16 text-gray-400">Facul: <span className="font-semibold text-gray-200">{response.collegeFocus}</span></div>
                  </td>
                  <td className="px-2 py-3">
                     <span className={`px-2.5 py-1 text-xs font-medium  ${
                      response.priority === 'Alta' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                      response.priority === 'Baixa' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                     }`}>
                       {response.priority}
                     </span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {response.editRequestStatus === 'pending' && <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-1 text-[10px] font-bold uppercase font-['Space_Mono']">Pendente</span>}
                    {response.editRequestStatus === 'rejected' && <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-1 text-[10px] font-bold uppercase font-['Space_Mono']">Recusado</span>}
                    {!response.editRequestStatus && response.editAuthorized && <span className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 px-2 py-1 text-[10px] font-bold uppercase font-['Space_Mono']">Aprovado</span>}
                  </td>
                  <td className="px-2 py-3 text-center text-xs text-gray-400 ">
                    {response.lastEditedAt ? new Date(response.lastEditedAt).toLocaleDateString('pt-BR') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm border-t border-gray-100">
              Nenhum dado registrado no servidor.
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedMember(null)}>
          <div className="bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\] w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700  shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-\[rgba(255,255,255,0.02)\]/90 backdrop-blur-md border-b border-\[var(--color-ink-faint)\] p-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                  {selectedMember.name}
                  {selectedMember.status === 'Ex-membro' && (
                    <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-500 border border-red-500/20  font-medium uppercase tracking-wider">Ex-membro</span>
                  )}
                </h2>
                <p className="text-sm text-emerald-500/80 font-medium">{selectedMember.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsEditStatusOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium  transition-colors">
                  <Edit2 size={14} />
                  Alterar Status
                </button>
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                  Excluir Registro
                </button>
                <button onClick={() => setSelectedMember(null)} className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                {selectedMember.status === 'Ex-membro' && selectedMember.deletionReason && (
                  <div>
                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Motivo da Exclusão</h4>
                    <div className="bg-red-500/5 border border-red-500/10 p-4  text-sm">
                      <p className="text-gray-300 font-medium">"{selectedMember.deletionReason}"</p>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Informações Acadêmicas</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm">
                    <p className="mb-3"><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Curso</span> <span className="text-gray-200 font-medium">{selectedMember.course || 'Não informado'}</span></p>
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Período</span> <span className="text-gray-200 font-medium">{selectedMember.period || 'Não informado'}</span></p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Engajamento na LAJE</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm space-y-4">
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Área de Atuação</span> <span className="inline-block px-2.5 py-1 bg-\[rgba(255,255,255,0.02)\] border border-gray-700  text-gray-300 text-xs font-medium">{selectedMember.leagueRole}</span></p>
                    {selectedMember.weeklyHours && (
                      <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Dedicação Semanal</span> <span className="text-emerald-400 font-semibold">{selectedMember.weeklyHours}</span></p>
                    )}
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Projetos Atuais</span> <span className="text-gray-200 font-medium">{selectedMember.currentProjects || 'Nenhum'}</span></p>
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Projetos de Interesse</span> <span className="text-gray-200 font-medium">{selectedMember.interestedProjects || 'Nenhum'}</span></p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Métricas de Foco (1-5)</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                      <span className="text-gray-400 font-medium">Dedicação à LAJE</span>
                      <span className="text-emerald-400 font-bold text-lg">{selectedMember.leagueFocus} <span className="text-gray-500 text-xs font-medium">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-gray-400 font-medium">Dedicação à Faculdade</span>
                      <span className="text-emerald-400 font-bold text-lg">{selectedMember.collegeFocus} <span className="text-gray-500 text-xs font-medium">/ 5</span></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Status do Trabalho</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm space-y-5">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-xs font-semibold uppercase">Progresso Atual</span>
                        <span className="text-emerald-400 font-bold">{selectedMember.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${selectedMember.progress}%` }} />
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-3 border-t border-gray-700">
                      <span className="text-gray-400 text-xs font-semibold uppercase">Prioridade</span>
                      <span className={`px-2.5 py-1 text-xs font-bold  ${
                        selectedMember.priority === 'Alta' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                        selectedMember.priority === 'Baixa' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {selectedMember.priority}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-gray-700">
                      <span className="text-gray-400 text-xs font-semibold uppercase block mb-1">Deadline Final</span> 
                      <span className="text-gray-200 font-medium">{selectedMember.deadline ? new Date(selectedMember.deadline).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Não definido'}</span>
                    </div>
                  </div>
                </div>

                {selectedMember.roleFocus && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Foco na Função Atual</h4>
                    <div className="bg-gray-800 border border-gray-700 p-4 text-sm min-h-[60px]">
                      <p className="text-gray-300 leading-relaxed italic font-medium">
                        "{selectedMember.roleFocus}"
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Foco de Aprendizado</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm min-h-[100px]">
                    <p className="text-gray-300 leading-relaxed italic font-medium">
                      "{selectedMember.learningFocus || 'Nenhum foco específico relatado.'}"
                    </p>
                  </div>
                </div>
                
                <div className="pt-4 flex flex-col gap-2 border-t border-\[var(--color-ink-faint)\]">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Timestamp do Registro</h4>
                    <p className="text-[10px] text-gray-500 font-medium">{new Date(selectedMember.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  {selectedMember.lastEditedAt && (
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Última Edição</h4>
                      <p className="text-[10px] text-gray-500 font-medium">{new Date(selectedMember.lastEditedAt).toLocaleString('pt-BR')}</p>
                    </div>
                  )}
                  {selectedMember.editRequestStatus === 'pending' && (
                    <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 flex flex-col items-start gap-3">
                      <p className="text-xs text-yellow-500 font-bold uppercase tracking-wider font-['Space_Mono']">Solicitação de Edição Pendente</p>
                      <div className="flex gap-3 w-full">
                        <button
                          onClick={() => handleAuthorizeEdit(selectedMember, true)}
                          className="px-4 py-2 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] font-bold text-[0.65rem] uppercase tracking-[0.1em] transition-colors flex-1 cursor-pointer border-none font-['Space_Mono']"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleAuthorizeEdit(selectedMember, false)}
                          className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-[0.65rem] uppercase tracking-[0.1em] border border-red-500/20 transition-colors flex-1 cursor-pointer font-['Space_Mono']"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedMember.editHistory && selectedMember.editHistory.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-ink-faint)]">
                      <h4 className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider mb-3">Histórico de Solicitações</h4>
                      <ul className="space-y-2">
                        {selectedMember.editHistory.map((item: any, idx: number) => (
                          <li key={idx} className="flex justify-between items-center text-[10px] text-[var(--color-ink)] font-medium font-['Space_Mono'] bg-[rgba(255,255,255,0.02)] p-2 border border-[var(--color-ink-faint)]">
                            <span className={item.action === 'Aprovado' ? 'text-[var(--color-accent)]' : 'text-red-400'}>{item.action || 'Aprovado'}</span>
                            <span className="text-[var(--color-ink-muted)]">{new Date(item.timestamp || item).toLocaleString('pt-BR')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {isEditStatusOpen && selectedMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsEditStatusOpen(false)}>
          <div className="bg-\[rgba(255,255,255,0.02)\] border border-\[var(--color-ink-faint)\] w-full max-w-md  shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Alterar Status do Membro
              </h3>
              <button onClick={() => setIsEditStatusOpen(false)} className="text-gray-500 hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-gray-400 mb-6">
              Membro atual: <strong className="text-emerald-400">{selectedMember.name}</strong><br/>
              Status atual: <strong className="text-white">{selectedMember.status || 'Ativo'}</strong>
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-gray-800/50  border border-gray-700/50">
                <p className="text-sm text-gray-300 mb-2">Novo Status será:</p>
                <p className={`text-lg font-bold ${selectedMember.status === 'Ex-membro' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {selectedMember.status === 'Ex-membro' ? 'Ativo' : 'Ex-membro'}
                </p>
              </div>

              {selectedMember.status !== 'Ex-membro' && (
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500 mb-1 block">Motivo da Exclusão</label>
                  <textarea 
                    required 
                    rows={3}
                    value={deletionReason} 
                    onChange={e => setDeletionReason(e.target.value)}
                    placeholder="Descreva o motivo (ex: desligamento, formatura, inatividade)..."
                    className="w-full bg-gray-950 border border-\[var(--color-ink-faint)\] focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white p-2.5  outline-none transition-all resize-none" 
                  />
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setIsEditStatusOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-800 text-white font-bold  hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleChangeStatus}
                  disabled={isUpdatingStatus || (selectedMember.status !== 'Ex-membro' && !deletionReason.trim())}
                  className={`flex-1 flex items-center justify-center gap-2 font-bold  px-4 py-3 transition-colors disabled:opacity-50 ${
                    selectedMember.status === 'Ex-membro' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isUpdatingStatus ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar Alteração'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && selectedMember && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setIsDeleteConfirmOpen(false)}>
          <div className="bg-gray-950 border border-red-500/40 w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <Trash2 size={22} />
              <h3 className="text-lg font-bold">Excluir registro permanentemente?</h3>
            </div>
            <p className="text-sm text-gray-300 mb-5">
              O registro de <strong className="text-white">{selectedMember.name}</strong> será removido do Registro de Atualizações (RH) e não poderá ser recuperado.
            </p>
            <label className="text-xs font-semibold uppercase text-gray-500 mb-1 block">
              Digite EXCLUIR para confirmar
            </label>
            <input
              value={deleteConfirmation}
              onChange={e => setDeleteConfirmation(e.target.value)}
              autoFocus
              className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 text-white p-3 outline-none transition-colors"
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteConfirmation('');
                }}
                className="flex-1 px-4 py-3 bg-gray-800 text-white font-bold hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteMember}
                disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== 'EXCLUIR'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50 transition-colors"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
