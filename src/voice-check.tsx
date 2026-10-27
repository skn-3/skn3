import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter} from 'react-router-dom';
import {VoiceModeSheet} from './components/chat/VoiceModeSheet';
import './index.css';
const id='00000000-0000-4000-8000-000000000001';
function App(){const [open,setOpen]=useState(true);const [actions,setActions]=useState<any[]>([]);const ai:any={messages:[],actions,busy:false,send:async(text:string)=>{await new Promise(r=>setTimeout(r,700));if(text==='ja'){setActions(a=>a.map(x=>({...x,status:'confirmed'})));return {reply:'Kostnad 250 kr tillagd på Testgatan 1.',message_id:id,speech_text:'Kostnad 250 kronor tillagd.'};}setActions([{id,kind:'add_cost',status:'pending',created_at:new Date().toISOString(),decided_at:null,error:null,payload:{title:'Lägg till kostnad',rows:[{label:'Ärende',value:'Testgatan 1'},{label:'Belopp',value:'250 kr'},{label:'Beskrivning',value:'Testkostnad'}]}}]);return {reply:'Lägg till kostnad på Testgatan 1, 250 kr för testkostnad. Säg ja för att bekräfta.',speech_text:'Säg ja för att bekräfta.',message_id:id,action_id:id};},decide:async()=>({reply:'Bekräftad',message_id:id})};return <VoiceModeSheet open={open} onOpenChange={setOpen} ai={ai} onOpenCase={()=>{}}/>;}
createRoot(document.getElementById('root') as HTMLElement).render(<QueryClientProvider client={new QueryClient()}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>);
