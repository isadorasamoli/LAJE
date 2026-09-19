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

export const sendWelcomeEmail = async (accessToken: string, toEmail: string, name: string, events: any[]) => {
  try {
    const eventsHtml = events.length > 0 
      ? `<ul>${events.map(e => {
          // Generate Google Calendar Add Link
          // Format dates to YYYYMMDDTHHmmssZ
          const startDate = new Date(e.date);
          const endDate = new Date(e.date);
          
          // Parse duration if it contains numbers, simple fallback to 1 hour
          const durationMatch = e.duration.match(/(\d+)/);
          const durationHours = durationMatch ? parseInt(durationMatch[1], 10) : 1;
          endDate.setHours(endDate.getHours() + durationHours);

          const formatForGcal = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
          
          const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&details=${encodeURIComponent(e.description)}&dates=${formatForGcal(startDate)}/${formatForGcal(endDate)}`;

          return `<li style="margin-bottom: 10px;">
            <strong>${e.title}</strong>: ${new Date(e.date).toLocaleString()} (${e.duration})<br/>
            <span style="color: #aaa; font-size: 12px;">${e.description}</span><br/>
            <a href="${gcalLink}" target="_blank" style="display: inline-block; margin-top: 4px; padding: 4px 8px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 4px; font-size: 12px;">Adicionar ao Google Agenda</a>
          </li>`;
        }).join('')}</ul>`
      : '<p>Nenhum evento futuro agendado no momento.</p>';

    const emailContent = [
      'Content-Type: text/html; charset="UTF-8"\n',
      'MIME-Version: 1.0\n',
      `To: ${toEmail}\n`,
      'Subject: Bem-vindo ao Calendário da LAJE!\n\n',
      `<div style="font-family: sans-serif; color: #e5e7eb; background-color: #030712; padding: 24px; border: 1px solid #1f2937; border-radius: 8px;">
        <h1 style="color: #10b981;">Bem-vindo(a), ${name}!</h1>
        <p>Você realizou seu primeiro login no portal. Aqui estão os próximos eventos agendados:</p>
        ${eventsHtml}
        <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">Este é um e-mail automático do sistema LAJE HR.</p>
      </div>`
    ].join('');

    // Base64url encode
    const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: base64EncodedEmail }),
    });

    if (!res.ok) {
       const err = await res.json();
       throw new Error(`Failed to send email: ${JSON.stringify(err)}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Error sending welcome email', error);
    throw error;
  }
};
