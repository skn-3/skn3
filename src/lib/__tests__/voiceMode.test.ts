import { describe, it, expect } from 'vitest';
import { interpretVoiceDecision, speechText } from '../../../supabase/functions/n3-ai/logic';
describe('voice decisions', () => {
  it.each(['ja','ja kör','kör','okej','bekräfta','gör det','stämmer',' Ja! '])('confirms only exact phrase %s', text => expect(interpretVoiceDecision(text)).toBe('confirm'));
  it.each(['nej','avbryt','vänta','nix','ta bort'])('cancels %s', text => expect(interpretVoiceDecision(text)).toBe('cancel'));
  it.each(['ja men ändra beloppet','nej ändra datum','ja tack','visa ärendet'])('keeps ordinary message %s', text => expect(interpretVoiceDecision(text)).toBeNull());
});
describe('speech text', () => {
  it('removes markers and markdown', () => expect(speechText('**Hej**\n[[case:123]] [[link:/?case=123|Öppna]]')).toBe('Hej'));
  it('cuts at a sentence boundary within 600 characters', () => expect(speechText('Klart. '+ 'långt '.repeat(150))).toBe('Klart.'));
});
import { summarizeAiUsage } from '../aiUsage';
describe('tts usage is separate', () => {
 it('does not count speech against message statistics', () => {
  const totals=summarizeAiUsage([{user_id:'u',status:'ok',kind:'tts',tts_characters:200,prompt_tokens:0,completion_tokens:0,total_tokens:0,created_at:'2026-10-27T10:00:00Z'}], '2026-10-27T00:00:00Z');
  expect(totals.today.messages).toBe(0);expect(totals.tts.today.characters).toBe(200);expect(totals.tts.today.count).toBe(1);
 });
});
