import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { handleFirestoreError, OperationType } from './utils';

export interface AuditLogItem {
  id?: string;
  performedByEmail: string;
  performedByName?: string;
  performedByUid?: string;
  action: string;
  targetMemberId?: string;
  targetMemberName: string;
  targetMemberEmail?: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  timestamp: number;
}

export interface CreateAuditLogParams {
  action: 'Alteração de Status' | 'Atualização de Dados' | 'Autorização de Edição' | 'Recusa de Edição' | 'Exclusão de Membro' | string;
  targetMemberId?: string;
  targetMemberName: string;
  targetMemberEmail?: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  performedByEmail?: string;
  performedByName?: string;
  performedByUid?: string;
  timestamp?: number;
}

export async function logAuditAction(entry: CreateAuditLogParams): Promise<string | null> {
  try {
    const logId = crypto.randomUUID();
    const currentUser = auth.currentUser;
    const authorEmail = (entry.performedByEmail || currentUser?.email || 'desconhecido').trim();
    const authorName = (entry.performedByName || currentUser?.displayName || authorEmail.split('@')[0]).trim();
    const authorUid = entry.performedByUid || currentUser?.uid || '';

    const payload: AuditLogItem = {
      performedByEmail: authorEmail,
      performedByName: authorName,
      performedByUid: authorUid,
      action: entry.action,
      targetMemberId: entry.targetMemberId || '',
      targetMemberName: entry.targetMemberName || 'Não informado',
      targetMemberEmail: entry.targetMemberEmail || '',
      details: entry.details || '',
      previousValue: entry.previousValue || '',
      newValue: entry.newValue || '',
      timestamp: entry.timestamp || Date.now(),
    };

    await setDoc(doc(db, 'audit_logs', logId), payload);
    return logId;
  } catch (error) {
    console.error('Falha ao registrar log de auditoria:', error);
    try {
      handleFirestoreError(error, OperationType.CREATE, 'audit_logs');
    } catch {
      // Prevent blocking core UI
    }
    return null;
  }
}
