// The clock identity survives pauses and device handoffs. Recording batch IDs
// identify transport retries; these progress coordinates identify study time.
export type StudySessionIdentity = { id: string; progressStart: number };

export const newStudySessionIdentity = (): StudySessionIdentity => ({
  id: crypto.randomUUID(),
  progressStart: 0,
});

export const isStudySessionIdentity = (value: unknown): value is StudySessionIdentity => {
  const candidate = value as StudySessionIdentity | null;
  return Boolean(candidate && typeof candidate.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.id)
    && Number.isSafeInteger(candidate.progressStart) && candidate.progressStart >= 0);
};
