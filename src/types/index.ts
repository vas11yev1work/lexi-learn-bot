import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

export interface SessionData {
  action: string | null;
  sessionModuleId: number | null;
  cardId: number | null;
  currentSession: number | null;
  currentQuestionIndex: number;
  customFields: string[];
  tempData: Record<string, any>;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export type BotContext = MyContext & ConversationFlavor<MyContext>;
