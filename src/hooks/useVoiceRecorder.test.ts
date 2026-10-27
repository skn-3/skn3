import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from './useVoiceRecorder';
const invoke=vi.hoisted(()=>vi.fn().mockResolvedValue({data:{text:'Hej'}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke}}}));
let sounding=false;
class Recorder {
 static isTypeSupported(){return true;}
 state='inactive';onstop:(()=>void)|null=null;ondataavailable:((e:{data:Blob})=>void)|null=null;
 start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}
}
class Context {
 resume(){return Promise.resolve();}close(){return Promise.resolve();}
 createMediaStreamSource(){return {connect(){}};}
 createAnalyser(){return {fftSize:512,getByteTimeDomainData:(values:Uint8Array)=>values.fill(sounding?170:128)};}
}
beforeEach(()=>{vi.useFakeTimers();invoke.mockClear();sounding=false;vi.stubGlobal('MediaRecorder',Recorder);vi.stubGlobal('AudioContext',Context);Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn().mockResolvedValue({getTracks:()=>[{stop:vi.fn()}]})}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('automatic recording',()=>{
 it('waits eight seconds, then skips transcription of silence',async()=>{
  const onText=vi.fn();const {result,unmount}=renderHook(()=>useVoiceRecorder({onText,onError:vi.fn()}));
  await act(async()=>{await result.current.start(true);});
  act(()=>vi.advanceTimersByTime(7900));expect(result.current.state).toBe('recording');expect(onText).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(100));expect(result.current.state).toBe('idle');expect(onText).toHaveBeenCalledWith('');expect(invoke).not.toHaveBeenCalled();unmount();
 });
 it('stops two seconds after sound was heard',async()=>{
  const {result,unmount}=renderHook(()=>useVoiceRecorder({onText:vi.fn(),onError:vi.fn()}));
  await act(async()=>{await result.current.start(true);});sounding=true;act(()=>vi.advanceTimersByTime(100));sounding=false;
  act(()=>vi.advanceTimersByTime(1900));expect(result.current.state).toBe('recording');
  act(()=>vi.advanceTimersByTime(100));expect(result.current.state).toBe('transcribing');unmount();
 });
 it('keeps the twenty-second maximum with continuous sound',async()=>{
  const {result,unmount}=renderHook(()=>useVoiceRecorder({onText:vi.fn(),onError:vi.fn()}));
  await act(async()=>{await result.current.start(true);});sounding=true;
  act(()=>vi.advanceTimersByTime(19900));expect(result.current.state).toBe('recording');
  act(()=>vi.advanceTimersByTime(100));expect(result.current.state).toBe('transcribing');unmount();
 });
});
