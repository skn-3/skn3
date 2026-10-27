import { cases, ownScope, checkedId, rows, type ReadTool } from './context.ts';
export const getCase: ReadTool = {
 name:'get_case',description:'Hämta ett synligt ärende, kostnader, öppna och lösta avvikelser, senaste 15 händelser och plåtbeställningar.',
 schema:{type:'object',properties:{case_id:{type:'string'}},required:['case_id'],additionalProperties:false},
 async handler(args,ctx){ const id=checkedId(args); const fields='id,address,customer_name,customer_phone,customer_email,city,status,team,km_team,seller,order_number,offer_number,notes,montor_notes,montage_partial_note,montage_partial_at,units,km_date,km_time,montage_date,montage_time,delivery_date,delivery_time,delivery_week,delivery_year,carry_help_needed,is_gotland,extra_hours_requested'+(ctx.role==='montor'?'':',extra_hours_approved:extra_hours_approved_amount,extra_hours_sold,order_value,tb_percent');
 const found=await rows(ownScope(cases(ctx).select(fields).eq('id',id),ctx),ctx);if(!found.length)return {error:'Ärendet finns inte eller är inte synligt för dig.'};
 const sections=await Promise.all([
 ['costs',ctx.userClient.from('case_costs').select('id,description,amount,category,responsible,created_by,created_at').eq('case_id',id).order('created_at',{ascending:false})],
 ['deviations',ctx.userClient.from('deviations').select('id,type,title,description,status,resolved,resolved_at,action_needed,created_by,created_at').eq('case_id',id).order('created_at',{ascending:false})],
 ['events',ctx.userClient.from('case_events').select('id,event_type,description,created_by,created_at').eq('case_id',id).order('created_at',{ascending:false}).limit(15)],
 ['sheet_metal_orders',ctx.userClient.from('sheet_metal_orders').select('id,status,profiles,notes,delivery_address,created_by,created_at').eq('case_id',id).order('created_at',{ascending:false})]
 ].map(async ([key,q])=>{ try { const {data,error}=await (q as any).limit(key==='events'?15:20);return [key,error?{error:error.message}:data??[]]; }catch{return [key,{error:'Uppgifter kunde inte hämtas'}];} }));
 return {case:found[0],...Object.fromEntries(sections)}; }
};
