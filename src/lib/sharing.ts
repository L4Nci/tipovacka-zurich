export type ShareCardType =
  | 'lobby_invitation'
  | 'leaderboard_top_three'
  | 'player_rank'
  | 'round_result'
  | 'player_profile'
  | 'badge'
  | 'official_event_result'
  | 'tournament_winner'
  | 'hall_of_fame';

export type ShareCardInput = {
  type: ShareCardType;
  title: string;
  subtitle?: string;
  identity?: string;
  stats?: Array<{ label: string; value: string }>;
  context?: string;
  accentColor?: string;
  partnerName?: string;
};

const JOIN_PATH_PREFIX = '/join/';
const SHARE_CARD_LABELS: Record<ShareCardType, string> = {
  lobby_invitation: 'Pozvánka do lobby',
  leaderboard_top_three: 'Nejlepší tipéři',
  player_rank: 'Pořadí hráče',
  round_result: 'Výsledek kola',
  player_profile: 'Profil hráče',
  badge: 'Odznak',
  official_event_result: 'Výsledek oficiálního turnaje',
  tournament_winner: 'Vítěz turnaje',
  hall_of_fame: 'Síň slávy'
};

export const normalizeInviteCode = (value: string) => value.trim().toUpperCase();

export const getInviteCodeFromLocation = (
  pathname: string,
  search: string
) => {
  if (pathname.startsWith(JOIN_PATH_PREFIX)) {
    try {
      return normalizeInviteCode(decodeURIComponent(pathname.slice(JOIN_PATH_PREFIX.length)));
    } catch {
      return '';
    }
  }
  return normalizeInviteCode(new URLSearchParams(search).get('join') || '');
};

export const buildInviteUrl = (
  joinCode: string,
  origin: string
) => `${origin.replace(/\/$/, '')}${JOIN_PATH_PREFIX}${encodeURIComponent(normalizeInviteCode(joinCode))}`;

export const createQrDataUrl = async (value: string) => {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 640,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });
};

const drawWrappedText = (
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) => {
  const words = value.split(/\s+/);
  let line = '';
  let lineIndex = 0;
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex += 1;
    } else {
      line = candidate;
    }
  });
  if (line) context.fillText(line, x, y + lineIndex * lineHeight);
};

export const renderShareCard = async (input: ShareCardInput) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sdílecí kartu se nepodařilo připravit.');

  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const accentColor = input.accentColor && /^#[0-9A-Fa-f]{6}$/.test(input.accentColor)
    ? input.accentColor
    : '#dc2626';
  context.fillStyle = accentColor;
  context.fillRect(0, 0, canvas.width, 22);

  context.fillStyle = '#0f172a';
  context.font = '900 42px system-ui';
  context.fillText('TIPOVAČKA', 80, 110);
  context.fillStyle = accentColor;
  context.font = '800 24px system-ui';
  context.fillText(SHARE_CARD_LABELS[input.type].toUpperCase(), 80, 158);

  context.fillStyle = '#0f172a';
  context.font = '900 72px system-ui';
  drawWrappedText(context, input.title, 80, 300, 920, 84);

  if (input.subtitle) {
    context.fillStyle = '#475569';
    context.font = '600 34px system-ui';
    drawWrappedText(context, input.subtitle, 80, 490, 920, 46);
  }

  if (input.identity) {
    context.fillStyle = accentColor;
    context.font = '800 38px system-ui';
    context.fillText(input.identity, 80, 650);
  }

  input.stats?.slice(0, 4).forEach((stat, index) => {
    const y = 760 + index * 115;
    context.fillStyle = '#e2e8f0';
    context.fillRect(80, y - 52, 920, 82);
    context.fillStyle = '#475569';
    context.font = '700 25px system-ui';
    context.fillText(stat.label.toUpperCase(), 108, y);
    context.fillStyle = '#0f172a';
    context.font = '900 34px system-ui';
    context.textAlign = 'right';
    context.fillText(stat.value, 970, y);
    context.textAlign = 'left';
  });

  if (input.context) {
    context.fillStyle = '#64748b';
    context.font = '600 25px system-ui';
    drawWrappedText(context, input.context, 80, 1240, 920, 34);
  }

  if (input.partnerName) {
    context.fillStyle = '#475569';
    context.font = '700 22px system-ui';
    context.textAlign = 'right';
    context.fillText(`S partnerem ${input.partnerName}`, 1000, 1300);
    context.textAlign = 'left';
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Sdílecí kartu se nepodařilo exportovat.'));
    }, 'image/png');
  });
};

export const shareOrCopy = async ({
  title,
  text,
  url
}: {
  title: string;
  text: string;
  url: string;
}) => {
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return 'shared' as const;
  }
  await navigator.clipboard.writeText(url);
  return 'copied' as const;
};
