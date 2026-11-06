import { translate, intlLocale, type LocaleInput } from '../i18n/index.ts';
import type { Lobby, LobbyPrizeEntry, OfficialEventSeasonResult } from '../types.ts';

export const MAX_LOBBY_PRIZES = 10;
export const MAX_LOBBY_PRIZE_LABEL_LENGTH = 120;

export const normalizeLobbyPrizeEntries = (
  entries: LobbyPrizeEntry[]
): LobbyPrizeEntry[] => {
  if (entries.length > MAX_LOBBY_PRIZES) {
    throw new Error(`Lze uložit nejvýše ${MAX_LOBBY_PRIZES} cen.`);
  }

  const labels = entries
    .map(entry => String(entry.label || '').trim())
    .filter(Boolean);

  if (labels.some(label => label.length > MAX_LOBBY_PRIZE_LABEL_LENGTH)) {
    throw new Error(`Jedna cena může mít nejvýše ${MAX_LOBBY_PRIZE_LABEL_LENGTH} znaků.`);
  }
  if (labels.some(label => /[<>]/.test(label))) {
    throw new Error('Text ceny nesmí obsahovat HTML.');
  }

  return labels.map((label, index) => ({
    position: index + 1,
    label
  }));
};

export const prepareLobbyPrizeSelection = ({
  enabled,
  entries
}: {
  enabled: boolean;
  entries: LobbyPrizeEntry[];
}) => {
  const normalizedEntries = enabled ? normalizeLobbyPrizeEntries(entries) : [];
  if (enabled && normalizedEntries.length === 0) {
    throw new Error('Doplň alespoň jednu cenu.');
  }

  return {
    enabled,
    entries: normalizedEntries
  };
};

export type LobbyPrizeMetadata = {
  id: string;
  prizes_enabled: boolean;
  prize_entries: LobbyPrizeEntry[];
};

export const isLobbyPrizeSchemaMismatch = (error: {
  code?: string;
  message?: string;
} | null | undefined) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('prizes_enabled') ||
    message.includes('prize_entries');
};

export const mergeLobbyPrizeMetadata = (
  lobbies: Lobby[],
  metadata: LobbyPrizeMetadata[]
): Lobby[] => {
  const metadataByLobby = new Map(metadata.map(item => [item.id, item]));
  return lobbies.map(lobby => {
    const prizeMetadata = metadataByLobby.get(lobby.id);
    return prizeMetadata
      ? {
          ...lobby,
          prizes_enabled: prizeMetadata.prizes_enabled,
          prize_entries: prizeMetadata.prize_entries
        }
      : lobby;
  });
};

export const preserveLobbyPrizeMetadata = (
  previous: Lobby[],
  next: Lobby[]
): Lobby[] => {
  const previousByLobby = new Map(previous.map(lobby => [lobby.id, lobby]));
  return next.map(lobby => {
    if (lobby.prizes_enabled !== undefined && lobby.prize_entries !== undefined) {
      return lobby;
    }
    const previousLobby = previousByLobby.get(lobby.id);
    if (
      previousLobby?.prizes_enabled === undefined &&
      previousLobby?.prize_entries === undefined
    ) {
      return lobby;
    }
    return {
      ...lobby,
      prizes_enabled: previousLobby?.prizes_enabled,
      prize_entries: previousLobby?.prize_entries
    };
  });
};

export const formatPrizePosition = (position: number, lang: LocaleInput = 'cs') => translate(lang, 'common.place', { position });

export const getSeasonResultHeadline = (
  result: Pick<OfficialEventSeasonResult, 'position' | 'participant_count'>, lang: LocaleInput = 'cs'
) => {
  if (!result.position || result.participant_count < 1) {
    return translate(lang, 'official.seasonPending');
  }
  return translate(lang, 'official.seasonHeadline', { position: result.position, count: result.participant_count.toLocaleString(intlLocale(lang)) });
};

export const getSeasonResultTier = (
  result: Pick<OfficialEventSeasonResult, 'position' | 'top_percent'>, lang: LocaleInput = 'cs'
) => {
  if (result.position === 1) return translate(lang, 'official.eventWinner');
  if (result.position && result.position <= 10) return 'TOP 10';
  return result.top_percent ? `TOP ${result.top_percent} %` : null;
};

export const shouldShowLobbyMakerCta = ({
  hasOwnedLobby,
  savedPrediction,
  viewedLeaderboard,
  completedEvent
}: {
  hasOwnedLobby: boolean;
  savedPrediction: boolean;
  viewedLeaderboard: boolean;
  completedEvent: boolean;
}) => !hasOwnedLobby && (savedPrediction || viewedLeaderboard || completedEvent);

export const buildOfficialEventShareUrl = (slug: string, origin: string) => {
  const url = new URL(origin);
  url.searchParams.set('event', slug);
  return url.toString();
};
