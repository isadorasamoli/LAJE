import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, setDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { CheckCircle, Loader2, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface FormProps {
  user: User | null;
  token: string;
}

export default function Form({ user, token }: FormProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [existingResponse, setExistingResponse] = useState<any>(null);
  const [fetchingExisting, setFetchingExisting] = useState(true);

  const [formData, setFormData] = useState({
    name: user?.displayName || '',
    course: '',
    period: '',
    collegeFocus: 3,
    leagueRole: 'Programação',
    leagueFocus: 3,
    weeklyHours: '4h',
    roleFocus: '',
    learningFocus: '',
    currentProjects: '',
    interestedProjects: '',
    priority: 'Média',
    progress: 0,
    deadline: '',
  });

  useEffect(() => {
    const fetchExisting = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, 'responses'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setExistingResponse({ id: snap.docs[0].id, ...data });
          
          if (data.editAuthorized) {
            setFormData({
              name: data.name || '',
              course: data.course || '',
              period: data.period || '',
              collegeFocus: data.collegeFocus || 3,
              leagueRole: data.leagueRole || 'Programação',
              leagueFocus: data.leagueFocus || 3,
              weeklyHours: data.weeklyHours || '4h',
              roleFocus: data.roleFocus || '',
              learningFocus: data.learningFocus || '',
              currentProjects: data.currentProjects || '',
              interestedProjects: data.interestedProjects || '',
              priority: data.priority || 'Média',
              progress: data.progress || 0,
              deadline: data.deadline || '',
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch existing response", err);
      } finally {
        setFetchingExisting(false);
      }
    };
    fetchExisting();
  }, [user]);

  const requestEdit = async () => {
    if (!existingResponse || !token || !user) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'responses', existingResponse.id), {
        editRequestStatus: 'pending'
      });
      setExistingResponse({ ...existingResponse, editRequestStatus: 'pending' });
      toast.success('Solicitação de edição enviada para o RH!');
      
      // Notify HR
      const rhEmails = ['isadorasdml@gmail.com', 'isadora.mlima@ufpe.br'];
      
      if (rhEmails.length > 0) {
        const emailContent = [
          'Content-Type: text/html; charset="UTF-8"\n',
          'MIME-Version: 1.0\n',
          `Bcc: ${rhEmails.join(',')}\n`,
          `Subject: Pedido de Edição de Formulário: ${user.displayName || user.email}\n\n`,
          `<div style="font-family: sans-serif; padding: 24px;">
            <h2>Pedido de Edição</h2>
            <p>O membro <strong>${user.displayName || user.email}</strong> solicitou permissão para editar seu formulário.</p>
            <p>Acesse o Dashboard no sistema LAJE HR para aprovar ou rejeitar a solicitação.</p>
          </div>`
        ].join('');

        const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        try {
          await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: base64EncodedEmail }),
          });
        } catch (emailErr) {
          console.error("Failed to send notification email", emailErr);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao solicitar edição');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'range' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    setErrorMsg('');
    try {
      const responseData = {
        userId: user.uid,
        email: user.email || '',
        name: formData.name,
        course: formData.course,
        period: formData.period,
        collegeFocus: Number(formData.collegeFocus || 0),
        leagueRole: formData.leagueRole,
        leagueFocus: Number(formData.leagueFocus || 0),
        weeklyHours: formData.weeklyHours || '',
        roleFocus: formData.roleFocus,
        learningFocus: formData.learningFocus,
        currentProjects: formData.currentProjects,
        interestedProjects: formData.interestedProjects,
        priority: formData.priority,
        progress: Number(formData.progress),
        deadline: formData.deadline,
        status: 'Ativo' // ensure it remains active
      };

      if (existingResponse) {
        await updateDoc(doc(db, 'responses', existingResponse.id), {
          ...responseData,
          lastEditedAt: Date.now(),
          editAuthorized: false,
          editRequestStatus: null
        });
        toast.success('Formulário atualizado com sucesso!');
        setExistingResponse({ ...existingResponse, editAuthorized: false, editRequestStatus: null });
      } else {
        const newResponseId = crypto.randomUUID();
        await setDoc(doc(db, 'responses', newResponseId), {
          ...responseData,
          createdAt: Date.now()
        });
        toast.success('Formulário enviado com sucesso!');
      }

      setSuccess(true);
    } catch (error) {
      console.error('Error submitting form', error);
      setErrorMsg(error instanceof Error ? error.message : 'Erro ao enviar formulário. Verifique o console.');
      toast.error('Erro ao enviar formulário.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingExisting) {
    return (
      <div className="w-full flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-12 p-8 border border-emerald-500/20 bg-emerald-500/10 text-center flex flex-col items-center">
        <CheckCircle size={64} className="text-emerald-500 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Transmissão Concluída</h2>
        <p className="text-gray-400 font-medium">Seus dados foram sincronizados com o sistema do RH da LAJE.</p>
        <button 
          type="button"
          onClick={() => {
            setSuccess(false);
            if (existingResponse) {
               window.location.reload();
            }
          }}
          className="mt-8 px-6 py-2.5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] text-[var(--color-ink)] font-semibold hover:bg-[rgba(255,255,255,0.1)] transition-colors text-sm cursor-pointer"
        >
          Visualizar Resumo
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const isReadOnly = existingResponse && !existingResponse.editAuthorized;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto space-y-8 pb-12">
      {existingResponse && (
        <div className="flex items-center justify-between p-4 bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] mb-8">
          <div>
            <h3 className="font-['Syne'] uppercase text-[var(--color-ink)] font-bold">Status do Formulário</h3>
            <p className="font-['Space_Mono'] uppercase text-[0.7rem] text-[var(--color-ink-muted)]">
              {isReadOnly ? 'Somente Leitura - Aguardando ou requer autorização' : 'Modo de Edição Autorizado'}
            </p>
          </div>
          {isReadOnly && existingResponse.editRequestStatus === 'pending' ? (
             <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
               <Loader2 className="w-4 h-4 animate-spin" />
               Aguardando RH
             </div>
          ) : isReadOnly ? (
             <button 
               type="button"
               onClick={requestEdit}
               disabled={loading}
               className="px-4 py-2 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--color-ink)] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none flex items-center gap-2"
             >
               {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
               Solicitar Edição
             </button>
          ) : null}
        </div>
      )}

      {/* Dados Pessoais */}
      <section className="p-8 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--color-accent)]" />
        <h3 className="text-[var(--color-ink)] text-lg font-bold mb-6 flex items-center gap-2 uppercase tracking-[-0.04em] font-['Syne']">
          <span className="text-[var(--color-bg-dark)] bg-[var(--color-accent)] px-2 py-1 text-sm font-['Space_Mono']">01</span> Dados Pessoais & Acadêmicos
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Nome do Membro</label>
            <input required name="name" value={formData.name} onChange={handleChange} placeholder="Ex: Maria Silva" disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Curso</label>
            <input required name="course" value={formData.course} onChange={handleChange} placeholder="Ex: Ciência da Computação" disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Período</label>
            <input required name="period" value={formData.period} onChange={handleChange} placeholder="Ex: 5º Período" disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} />
          </div>
        </div>
      </section>

      {/* Dados da Liga */}
      <section className="p-8 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--color-accent)]" />
        <h3 className="text-[var(--color-ink)] text-lg font-bold mb-6 flex items-center gap-2 uppercase tracking-[-0.04em] font-['Syne']">
          <span className="text-[var(--color-bg-dark)] bg-[var(--color-accent)] px-2 py-1 text-sm font-['Space_Mono']">02</span> Dados da Liga
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Função Atual</label>
            <select name="leagueRole" value={formData.leagueRole} onChange={handleChange} disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all cursor-pointer ${isReadOnly ? 'opacity-50' : ''}`}>
              <option className="bg-gray-900 text-gray-200">Programação</option>
              <option className="bg-gray-900 text-gray-200">Arte</option>
              <option className="bg-gray-900 text-gray-200">Game Design</option>
              <option className="bg-gray-900 text-gray-200">Som</option>
              <option className="bg-gray-900 text-gray-200">Produção</option>
              <option className="bg-gray-900 text-gray-200">Marketing</option>
              <option className="bg-gray-900 text-gray-200">RH</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="weeklyHours" className="text-xs font-semibold uppercase text-gray-500">
              Dedicação Semanal à Liga (Horas)
            </label>
            <select 
              id="weeklyHours"
              name="weeklyHours" 
              value={formData.weeklyHours} 
              onChange={handleChange} 
              disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all cursor-pointer ${isReadOnly ? 'opacity-50' : ''}`}
            >
              <option className="bg-gray-900 text-gray-200" value="2h">2h</option>
              <option className="bg-gray-900 text-gray-200" value="4h">4h</option>
              <option className="bg-gray-900 text-gray-200" value="6h">6h</option>
              <option className="bg-gray-900 text-gray-200" value="8h">8h</option>
              <option className="bg-gray-900 text-gray-200" value="10h">10h</option>
              <option className="bg-gray-900 text-gray-200" value="+12h">+12h</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <label htmlFor="roleFocus" className="text-xs font-semibold uppercase text-gray-500">
            Foco dentro da sua função atual na liga
          </label>
          <textarea 
            id="roleFocus"
            name="roleFocus" 
            value={formData.roleFocus} 
            onChange={handleChange} 
            rows={3} 
            placeholder={`Descreva qual o seu foco dentro da sua atuação em ${formData.leagueRole}...`}
            disabled={isReadOnly}
            className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all resize-none ${isReadOnly ? 'opacity-50' : ''}`} 
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-gray-500">O que você quer focar em aprender agora?</label>
          <textarea required name="learningFocus" value={formData.learningFocus} onChange={handleChange} rows={3} disabled={isReadOnly}
            className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all resize-none ${isReadOnly ? 'opacity-50' : ''}`} />
        </div>
      </section>

      {/* Projetos & Tarefas */}
      <section className="p-8 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--color-accent)]" />
        <h3 className="text-[var(--color-ink)] text-lg font-bold mb-6 flex items-center gap-2 uppercase tracking-[-0.04em] font-['Syne']">
          <span className="text-[var(--color-bg-dark)] bg-[var(--color-accent)] px-2 py-1 text-sm font-['Space_Mono']">03</span> Projetos & Tarefas
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Projetos Atuais</label>
            <input required name="currentProjects" value={formData.currentProjects} onChange={handleChange} placeholder="Ex: Jogo X, Treinamento Y" disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} />
          </div>
          <div className="flex flex-col justify-end">
            <input id="interestedProjects" name="interestedProjects" value={formData.interestedProjects} onChange={handleChange} placeholder="Interesse em novos projetos? (Ex: área/jogo específico)" disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Nível de Prioridade</label>
            <select name="priority" value={formData.priority} onChange={handleChange} disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all cursor-pointer ${isReadOnly ? 'opacity-50' : ''}`}>
              <option className="bg-gray-900 text-gray-200">Baixa</option>
              <option className="bg-gray-900 text-gray-200">Média</option>
              <option className="bg-gray-900 text-gray-200">Alta</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-500">Data Limite / Meta</label>
            <input type="date" min={today} name="deadline" value={formData.deadline} onChange={handleChange} disabled={isReadOnly}
              className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5 outline-none transition-all cursor-pointer [color-scheme:dark] ${isReadOnly ? 'opacity-50' : ''}`} />
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      { !isReadOnly && (
        <div className="flex justify-end pt-4">
          <button 
            disabled={loading}
            type="submit"
            className="flex items-center gap-3 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] border-none font-bold px-10 py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer uppercase font-['Space_Mono']"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Transmitindo...
              </>
            ) : 'Submeter Dados'}
          </button>
        </div>
      )}
    </form>
  );
}
