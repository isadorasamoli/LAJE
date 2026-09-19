export const fetchUpcomingEvents = async (accessToken: string) => {
  try {
    const timeMin = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=3&orderBy=startTime&singleEvents=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch calendar events');
    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events', error);
    return [];
  }
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatEventHtml = (event: any, includeCalendarLink = true) => {
  const startDate = new Date(event.date);
  const endDate = new Date(event.date);
  const durationMatch = String(event.duration || '').match(/(\d+)/);
  const durationHours = durationMatch ? parseInt(durationMatch[1], 10) : 1;
  endDate.setHours(endDate.getHours() + durationHours);
  const formatForGcal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
  const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&details=${encodeURIComponent(event.description)}&dates=${formatForGcal(startDate)}/${formatForGcal(endDate)}`;

  return `<li style="margin-bottom: 10px;">
    <strong>${escapeHtml(event.title || 'Evento')}</strong>: ${startDate.toLocaleString('pt-BR')} (${escapeHtml(event.duration || '1 hora')})<br/>
    <span style="color: #aaa; font-size: 12px;">${escapeHtml(event.description || '')}</span>
    ${includeCalendarLink ? `<br/><a href="${gcalLink}" target="_blank" style="display: inline-block; margin-top: 4px; padding: 4px 8px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 4px; font-size: 12px;">Adicionar ao Google Agenda</a>` : ''}
  </li>`;
};

const sendGmailMessage = async (accessToken: string, headers: string[], html: string) => {
  const emailContent = [
    'Content-Type: text/html; charset="UTF-8"\n',
    'MIME-Version: 1.0\n',
    ...headers.map(header => `${header}\n`),
    `\n${html}`
  ].join('');
  const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64EncodedEmail })
  });
  if (!response.ok) throw new Error(`Gmail send failed: ${await response.text()}`);
};

export const sendWelcomeEmail = async (accessToken: string, toEmail: string, name: string, events: any[]) => {
  try {
    const eventsHtml = events.length > 0 
      ? `<ul>${events.map(event => formatEventHtml(event)).join('')}</ul>`
      : '<p>Nenhum evento futuro agendado no momento.</p>';

    const emailHtml = `<div style="font-family: sans-serif; color: #e5e7eb; background-color: #030712; padding: 24px; border: 1px solid #1f2937; border-radius: 8px;">
        <h1 style="color: #10b981;">Bem-vindo(a), ${escapeHtml(name)}!</h1>
        <p>Você realizou seu primeiro login no portal. Aqui estão os próximos eventos agendados:</p>
        ${eventsHtml}
        <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">Este é um e-mail automático do sistema LAJE HR.</p>
      </div>`;

    await sendGmailMessage(accessToken, [`To: ${toEmail}`, 'Subject: Bem-vindo ao Calendário da LAJE!'], emailHtml);
    return true;
  } catch (error) {
    console.error('Error sending welcome email', error);
    throw error;
  }
};

export const sendEventNotification = async (
  accessToken: string,
  emails: string[],
  event: any,
  type: 'create' | 'update' | 'delete'
) => {
  if (!emails.length) return;
  const isDelete = type === 'delete';
  const subject = type === 'create' ? 'Novo Evento' : type === 'update' ? 'Atualização de Evento' : 'Evento Cancelado';
  const heading = type === 'create' ? 'Novo evento cadastrado' : type === 'update' ? 'Evento atualizado' : 'Evento cancelado';
  const message = type === 'create'
    ? 'Um novo evento foi adicionado ao calendário da LAJE:'
    : type === 'update'
      ? 'As informações deste evento foram alteradas:'
      : 'Este evento foi excluído e não acontecerá mais:';

  const html = `<div style="font-family: sans-serif; color: #e5e7eb; background-color: #030712; padding: 24px; border: 1px solid #1f2937; border-radius: 8px;">
    <h1 style="color: ${isDelete ? '#ef4444' : '#10b981'};">${heading}</h1>
    <p>${message}</p>
    <ul>${formatEventHtml(event, !isDelete)}</ul>
    <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">E-mail automático do sistema LAJE HR.</p>
  </div>`;

  await sendGmailMessage(accessToken, [`Bcc: ${emails.join(',')}`, `Subject: ${subject}: ${event.title}`], html);
};
