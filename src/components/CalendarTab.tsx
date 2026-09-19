import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { getAuth } from 'firebase/auth';
import { ChevronLeft, ChevronRight, Plus, Loader2, X, Calendar as CalendarIcon, Clock, Trash2, Edit2, Search } from 'lucide-react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay, isToday, parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

interface CalendarProps {
  isAdmin: boolean;
  token: string;
}

export default function CalendarTab({ isAdmin, token }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  // Delete confirm state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: '1 hora',
    time: '14:00'
  });

  const [searchQuery, setSearchQuery] = useState('');

  const auth = getAuth();

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'events'), orderBy('date', 'asc'));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(docs);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleDayClick = (day: Date) => {
    if (!isAdmin) return;
    setSelectedDate(day);
    setEditingEventId(null);
    setFormData({ title: '', description: '', duration: '1 hora', time: '14:00' });
    setIsModalOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, event: any) => {
    e.stopPropagation();
    
    const d = new Date(event.date);
    setSelectedDate(d);
    setEditingEventId(event.id);
    setFormData({
      title: event.title,
      description: event.description,
      duration: event.duration,
      time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    });
    setIsModalOpen(true);
  };

  const handleDeleteRequest = (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    setEventToDelete(eventId);
    setDeleteConfirmOpen(true);
  };

  // Send update email to all registered members (including Ex-Membro)
  const sendEventEmail = async (eventData: any, type: 'create' | 'update' | 'delete') => {
    if (!token) return;
    try {
      // Get all active and ex-members
      const responseSnap = await getDocs(collection(db, 'responses'));
      const emails = responseSnap.docs
        .map(d => d.data())
        .filter(data => data.email)
        .map(data => data.email);

      if (emails.length === 0) return;

      const startDate = new Date(eventData.date);
      const endDate = new Date(eventData.date);
      const durationMatch = eventData.duration.match(/(\d+)/);
      const durationHours = durationMatch ? parseInt(durationMatch[1], 10) : 1;
      endDate.setHours(endDate.getHours() + durationHours);

      const formatForGcal = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
      const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventData.title)}&details=${encodeURIComponent(eventData.description)}&dates=${formatForGcal(startDate)}/${formatForGcal(endDate)}`;
      
      let subject = 'Novo Evento: ';
      let headerText = 'Novo Evento Adicionado';
      let bodyText = 'O seguinte evento foi adicionado no calendário da LAJE:';
      
      if (type === 'update') {
        subject = 'Atualização de Evento: ';
        headerText = 'Evento Atualizado';
        bodyText = 'O seguinte evento foi atualizado no calendário da LAJE:';
      } else if (type === 'delete') {
        subject = 'Evento Cancelado: ';
        headerText = 'Evento Cancelado';
        bodyText = 'O seguinte evento foi cancelado no calendário da LAJE e não ocorrerá mais:';
      }

      const emailContent = [
        'Content-Type: text/html; charset="UTF-8"\n',
        'MIME-Version: 1.0\n',
        `Bcc: ${emails.join(',')}\n`,
        `Subject: ${subject}${eventData.title}\n\n`,
        `<div style="font-family: sans-serif; color: #e5e7eb; background-color: #030712; padding: 24px; border: 1px solid #1f2937; border-radius: 8px;">
          <h1 style="color: ${type === 'delete' ? '#ef4444' : '#10b981'};">${headerText}</h1>
          <p>${bodyText}</p>
          <ul style="list-style: none; padding: 0;">
            <li style="margin-bottom: 10px; border-left: 4px solid ${type === 'delete' ? '#ef4444' : '#10b981'}; padding-left: 10px;">
              <strong style="${type === 'delete' ? 'text-decoration: line-through;' : ''}">${eventData.title}</strong>: ${new Date(eventData.date).toLocaleString()} (${eventData.duration})<br/>
              <span style="color: #aaa; font-size: 14px;">${eventData.description}</span><br/>
              ${type !== 'delete' ? `<a href="${gcalLink}" target="_blank" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 4px; font-size: 14px;">Adicionar ao Google Agenda</a>` : ''}
            </li>
          </ul>
        </div>`
      ].join('');

      const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64EncodedEmail }),
      });
    } catch (err) {
      console.error("Failed to send calendar emails", err);
    }
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;
    try {
      const eventRecord = events.find(e => e.id === eventToDelete);
      await deleteDoc(doc(db, 'events', eventToDelete));
      toast.success('Evento excluído com sucesso');
      if (eventRecord) {
        await sendEventEmail(eventRecord, 'delete');
      }
      fetchEvents();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'events');
      toast.error('Erro ao excluir evento');
    } finally {
      setDeleteConfirmOpen(false);
      setEventToDelete(null);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const eventDate = new Date(selectedDate);
      const [hours, minutes] = formData.time.split(':');
      eventDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      const eventData = {
        title: formData.title,
        description: formData.description,
        duration: formData.duration,
        date: eventDate.toISOString()
      };

      if (editingEventId) {
        await updateDoc(doc(db, 'events', editingEventId), eventData);
        toast.success('Evento atualizado com sucesso!');
        await sendEventEmail(eventData, 'update');
      } else {
        const newEvent = {
          ...eventData,
          userId: auth.currentUser?.uid || '',
          createdAt: Date.now()
        };
        await addDoc(collection(db, 'events'), newEvent);
        toast.success('Evento criado com sucesso!');
        await sendEventEmail(eventData, 'create');
      }
      
      setIsModalOpen(false);
      setFormData({ title: '', description: '', duration: '1 hora', time: '14:00' });
      fetchEvents();
    } catch (error) {
      handleFirestoreError(error, editingEventId ? OperationType.UPDATE : OperationType.CREATE, 'events');
      toast.error('Erro ao salvar evento');
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const filteredEvents = events.filter(e => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      (e.title && e.title.toLowerCase().includes(lowerQuery)) ||
      (e.description && e.description.toLowerCase().includes(lowerQuery))
    );
  });

  return (
    <div className="w-full max-w-5xl mx-auto pb-12">
      {/* Search Bar */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 text-[var(--color-ink)]" size={20} />
        <input 
          type="text" 
          placeholder="BUSCAR EVENTOS POR TÍTULO OU DESCRIÇÃO..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full max-w-[500px] bg-transparent border border-[var(--color-ink-faint)] py-[14px] pl-[44px] pr-[14px] text-[var(--color-ink)] font-['Space_Mono'] text-[0.85rem] outline-none focus:border-[var(--color-accent)] uppercase transition-colors"
        />
      </div>

      <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] p-6">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-['Syne'] uppercase text-[1.8rem] font-bold text-[var(--color-ink)] tracking-[-0.04em]">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <div className="flex gap-2">
            <button onClick={handlePrevMonth} className="bg-[var(--color-ink-faint)] border-none p-2 cursor-pointer text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.1)] transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button onClick={handleNextMonth} className="bg-[var(--color-ink-faint)] border-none p-2 cursor-pointer text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.1)] transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="grid grid-cols-7 gap-[1px] bg-[var(--color-ink-faint)] border border-[var(--color-ink-faint)]">
          {/* Days of week */}
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="bg-[var(--color-bg-dark)] p-3 text-center text-[var(--color-ink-muted)] text-[0.65rem] font-bold uppercase tracking-[0.1em]">
              {day}
            </div>
          ))}

          {loading ? (
            <div className="col-span-7 bg-[var(--color-bg-dark)] py-20 flex justify-center text-[var(--color-accent)]">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : (
            days.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isTodayDate = isToday(day);
              
              // Find events for this day
              const dayEvents = filteredEvents.filter(e => {
                if (!e.date) return false;
                return isSameDay(parseISO(e.date), day);
              });

              return (
                <div 
                  key={idx} 
                  onClick={() => handleDayClick(day)}
                  className={`bg-[var(--color-bg-dark)] min-h-[120px] p-3 relative transition-colors cursor-pointer group flex flex-col ${
                    !isCurrentMonth ? 'opacity-25' : 
                    isTodayDate ? 'bg-[rgba(16,185,129,0.03)] hover:bg-[rgba(255,255,255,0.03)]' : 
                    'hover:bg-[rgba(255,255,255,0.03)]'
                  }`}
                >
                  <span className={`font-['Space_Mono'] text-[0.8rem] mb-2 self-start ${
                    isTodayDate ? 'bg-[var(--color-accent)] text-[var(--color-bg-dark)] px-1.5 rounded-sm' : ''
                  }`}>
                    {format(day, 'd')}
                  </span>
                  
                  {isAdmin && (
                    <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-50 cursor-pointer bg-transparent border-none text-[var(--color-ink)] transition-opacity">
                      <Plus size={14} />
                    </button>
                  )}
                  
                  <div className="flex-1 overflow-y-auto space-y-1 scrollbar-none w-full">
                    {dayEvents.map(evt => (
                      <div 
                        key={evt.id} 
                        onClick={(e) => handleEventClick(e, evt)}
                        className="bg-[var(--color-accent)] text-[var(--color-bg-dark)] text-[0.65rem] px-2 py-1 rounded-sm mt-1 font-bold cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis w-full text-left"
                      >
                        {format(parseISO(evt.date), 'HH:mm')} - {evt.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] w-full max-w-sm  shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <Trash2 className="mx-auto text-red-500 mb-4" size={32} />
            <h3 className="text-lg font-bold text-[var(--color-ink)] mb-2">Excluir Evento</h3>
            <p className="text-sm text-[var(--color-ink-muted)] mb-6">Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-800 text-[var(--color-ink)]  hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-500/20 text-red-500 border border-red-500/30  hover:bg-red-500 hover:text-[var(--color-ink)] transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] w-full max-w-md shadow-2xl p-8" onClick={e => e.stopPropagation()}>
            {!isAdmin ? (
              <div>
                 <h3 className="text-lg font-bold text-[var(--color-ink)] font-['Syne'] uppercase flex items-center gap-2 mb-6">
                    <CalendarIcon className="text-[var(--color-accent)]" size={20} />
                    Detalhes do Evento
                 </h3>
                 <div className="space-y-6">
                    <div>
                       <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Título</h4>
                       <p className="text-[var(--color-ink)] font-bold text-lg">{formData.title}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                           <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Horário</h4>
                           <p className="text-[var(--color-ink)]">{format(selectedDate, 'dd/MM/yyyy')} às {formData.time}</p>
                       </div>
                       <div>
                           <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Duração</h4>
                           <p className="text-[var(--color-ink)]">{formData.duration}</p>
                       </div>
                    </div>
                    <div>
                       <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Descrição</h4>
                       <p className="text-[var(--color-ink)] whitespace-pre-wrap leading-relaxed">{formData.description}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsModalOpen(false)} className="mt-8 w-full px-4 py-3 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--color-ink)] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none font-['Space_Mono']">
                    Fechar
                 </button>
              </div>
            ) : (
            <>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-[var(--color-ink)] font-['Syne'] uppercase flex items-center gap-2">
                <CalendarIcon className="text-[var(--color-accent)]" size={20} />
                {editingEventId ? 'Editar Evento' : 'Novo Evento'}
              </h3>
              <div className="flex items-center gap-2">
                {editingEventId && (
                  <button 
                    onClick={(e) => handleDeleteRequest(e, editingEventId)} 
                    className="text-[var(--color-ink-muted)] hover:text-red-400 transition-colors bg-transparent border-none cursor-pointer"
                    title="Excluir Evento"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button onClick={() => setIsModalOpen(false)} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent border-none cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <p className="text-sm text-[var(--color-ink-muted)] mb-6 font-['Space_Mono']">
              Criando evento para <strong className="text-[var(--color-accent)]">{format(selectedDate, 'dd/MM/yyyy')}</strong>
            </p>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Título do Evento</label>
                <input 
                  required 
                  autoFocus
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="Ex: Reunião Geral"
                  className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all" 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Horário</label>
                  <input 
                    required 
                    type="time"
                    value={formData.time} 
                    onChange={e => setFormData({...formData, time: e.target.value})}
                    className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all [color-scheme:dark]" 
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Duração</label>
                  <input 
                    required 
                    value={formData.duration} 
                    onChange={e => setFormData({...formData, duration: e.target.value})}
                    placeholder="Ex: 2 horas"
                    className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Descrição</label>
                <textarea 
                  required 
                  rows={3}
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Detalhes do evento..."
                  className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all resize-none" 
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] border-none uppercase font-['Space_Mono'] font-bold  px-4 py-3 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Evento'}
                </button>
              </div>
            </form>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
