const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 600px;
  margin: 0 auto;
  color: #1a1a1a;
`;

const BTN = (href: string, text: string, color = '#2563eb') => `
  <a href="${href}"
     style="display:inline-block;padding:12px 28px;background:${color};color:#fff;
            text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;
            margin:20px 0;">
    ${text}
  </a>
`;

const FOOTER = `
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;
              font-size:12px;color:#9ca3af;text-align:center;">
    Накрыто — система бронирования столов · <a href="https://nakryto.ru" style="color:#9ca3af;">nakryto.ru</a>
  </div>
`;

function wrap(content: string) {
  return `<!DOCTYPE html><html><body style="${BASE_STYLE}">${content}${FOOTER}</body></html>`;
}

export function verificationEmail(name: string, verifyUrl: string): string {
  return wrap(`
    <h2 style="color:#2563eb;">Подтвердите email</h2>
    <p>Здравствуйте, <strong>${name}</strong>!</p>
    <p>Спасибо за регистрацию в сервисе Накрыто. Подтвердите ваш email-адрес, нажав кнопку ниже.</p>
    ${BTN(verifyUrl, 'Подтвердить email')}
    <p style="color:#6b7280;font-size:13px;">Ссылка действительна 7 дней. Если вы не регистрировались — просто проигнорируйте это письмо.</p>
  `);
}

export function passwordResetEmail(name: string, resetUrl: string): string {
  return wrap(`
    <h2 style="color:#2563eb;">Сброс пароля</h2>
    <p>Здравствуйте, <strong>${name}</strong>!</p>
    <p>Мы получили запрос на сброс пароля для вашего аккаунта.</p>
    ${BTN(resetUrl, 'Сбросить пароль', '#dc2626')}
    <p style="color:#6b7280;font-size:13px;">Ссылка действительна <strong>1 час</strong>. Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>
  `);
}

export function newBookingStaffEmail(booking: {
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  guestCount: number;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
  source: string;
}, restaurantName: string, tableName: string, hallName: string, dashboardUrl: string): string {
  const dateStr = booking.startsAt.toLocaleDateString('ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStart = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const timeEnd = booking.endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sourceLabel = booking.source === 'ONLINE' ? '🌐 Онлайн' : '📞 Вручную';

  return wrap(`
    <h2 style="color:#16a34a;">Новая бронь — ${restaurantName}</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <tr style="background:#f0fdf4;">
        <td style="padding:10px 14px;border:1px solid #d1fae5;font-weight:600;width:40%;">Гость</td>
        <td style="padding:10px 14px;border:1px solid #d1fae5;">${booking.guestName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Телефон</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.guestPhone}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Дата</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${dateStr}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Время</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${timeStart} — ${timeEnd}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Стол</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${tableName} · ${hallName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Гостей</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.guestCount}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Источник</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${sourceLabel}</td>
      </tr>
      ${booking.notes ? `
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Комментарий</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.notes}</td>
      </tr>` : ''}
    </table>
    ${BTN(dashboardUrl, 'Открыть дашборд', '#16a34a')}
  `);
}

export function bookingReceivedGuestEmail(booking: {
  guestName: string;
  guestCount: number;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
  token: string;
}, restaurantName: string, tableName: string, hallName: string, bookingUrl: string): string {
  const dateStr = booking.startsAt.toLocaleDateString('ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStart = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const timeEnd = booking.endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return wrap(`
    <h2 style="color:#d97706;">Заявка на бронь получена</h2>
    <p>Здравствуйте, <strong>${booking.guestName}</strong>!</p>
    <p>Ваша заявка на столик в <strong>${restaurantName}</strong> получена и находится на рассмотрении. Мы пришлём подтверждение в ближайшее время.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0;">
      <tr style="background:#fffbeb;">
        <td style="padding:10px 14px;border:1px solid #fde68a;font-weight:600;width:40%;">Ресторан</td>
        <td style="padding:10px 14px;border:1px solid #fde68a;">${restaurantName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Дата</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${dateStr}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Время</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${timeStart} — ${timeEnd}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Стол</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${tableName} · ${hallName}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Гостей</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.guestCount}</td>
      </tr>
      ${booking.notes ? `
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Пожелания</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.notes}</td>
      </tr>` : ''}
    </table>
    <p style="color:#6b7280;font-size:13px;">Как только ресторан подтвердит бронь, вы получите ещё одно письмо.</p>
    ${BTN(bookingUrl, 'Посмотреть бронь', '#d97706')}
  `);
}

export function bookingConfirmedGuestEmail(booking: {
  guestName: string;
  guestCount: number;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
  token: string;
}, restaurantName: string, restaurantAddress: string | null, tableName: string, hallName: string, bookingUrl: string): string {
  const dateStr = booking.startsAt.toLocaleDateString('ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStart = booking.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const timeEnd = booking.endsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return wrap(`
    <h2 style="color:#16a34a;">Бронь подтверждена!</h2>
    <p>Здравствуйте, <strong>${booking.guestName}</strong>!</p>
    <p>Ваша бронь в <strong>${restaurantName}</strong> подтверждена. Ждём вас!</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0;">
      <tr style="background:#f0fdf4;">
        <td style="padding:10px 14px;border:1px solid #d1fae5;font-weight:600;width:40%;">Ресторан</td>
        <td style="padding:10px 14px;border:1px solid #d1fae5;">${restaurantName}</td>
      </tr>
      ${restaurantAddress ? `
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Адрес</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${restaurantAddress}</td>
      </tr>` : ''}
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Дата</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${dateStr}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Время</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${timeStart} — ${timeEnd}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Стол</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${tableName} · ${hallName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Гостей</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.guestCount}</td>
      </tr>
      ${booking.notes ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Пожелания</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${booking.notes}</td>
      </tr>` : ''}
    </table>
    ${BTN(bookingUrl, 'Управлять бронью', '#16a34a')}
    <p style="color:#6b7280;font-size:13px;">По ссылке выше можно отменить бронь если планы изменились.</p>
  `);
}

export function newRestaurantSuperAdminEmail(restaurantName: string, ownerName: string, ownerEmail: string, dashboardUrl: string): string {
  return wrap(`
    <h2 style="color:#7c3aed;">Новый ресторан зарегистрирован</h2>
    <p>В системе Накрыто появился новый ресторан.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <tr style="background:#faf5ff;">
        <td style="padding:10px 14px;border:1px solid #e9d5ff;font-weight:600;width:40%;">Ресторан</td>
        <td style="padding:10px 14px;border:1px solid #e9d5ff;">${restaurantName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Владелец</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${ownerName}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;">Email</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;">${ownerEmail}</td>
      </tr>
    </table>
    ${BTN(dashboardUrl, 'Открыть панель суперадмина', '#7c3aed')}
  `);
}
