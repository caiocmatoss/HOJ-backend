#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
require('tsx/cjs');
const { PrismaClient } = require('../generated/prisma/client.ts');

const SUPPORTED = new Map([
  ['bar', 'Bar'], ['pub', 'Bar'], ['cocktail bar', 'Bar'], ['beer bar', 'Bar'],
  ['night club', 'Balada'], ['nightclub', 'Balada'], ['dance club', 'Balada'],
  ['music venue', 'Casa de show'], ['concert hall', 'Casa de show'],
  ['restaurant', 'Restaurante'], ['food', 'Restaurante'],
  ['festival event venue', 'Casa de show'], ['event venue', 'Casa de show'],
]);
const CRITICAL_FLAGS = new Set(['closed','duplicate','delete','privatevenue','inappropriate','doesnt_exist']);
function parseCsv(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i], n=text[i+1]; if(quoted){if(c==='"'&&n==='"'){field+='"';i++;} else if(c==='"') quoted=false; else field+=c;} else if(c==='"'&&field===''){quoted=true;} else if(c===','){row.push(field);field='';} else if(c===String.fromCharCode(10)){row.push(field);rows.push(row);row=[];field='';} else if(c!=='\r') field+=c;}
  if(field.length||row.length){row.push(field);rows.push(row);} if(!rows.length)return [];
  const headers=rows.shift().map(x=>x.trim()); return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function normalizeCategory(row){const values=[row.fsq_category_labels,row.category,row.category_label].filter(Boolean).join('|').toLowerCase().split(/[|;,]/).map(x=>x.trim()); return values.map(x=>SUPPORTED.get(x)).find(Boolean)??null;}
function normalizeRow(row){
  const id=String(row.fsq_place_id||row.fsq_id||row.external_id||'').trim(), name=String(row.name||'').trim(), latitude=Number(row.latitude), longitude=Number(row.longitude);
  const flags=String(row.unresolved_flags||'').toLowerCase().split(/[|;,\s]+/).filter(Boolean), category=normalizeCategory(row);
  const reason=!id?'missing_id':!name?'missing_name':!Number.isFinite(latitude)||latitude<-90||latitude>90?'invalid_latitude':!Number.isFinite(longitude)||longitude<-180||longitude>180?'invalid_longitude':row.date_closed?'closed':flags.some(f=>CRITICAL_FLAGS.has(f))?'critical_flag':!category?'unsupported_category':null;
  return {ok:!reason, reason, value:{name,category,address:String(row.address||'').trim(),latitude,longitude,locality:row.locality||null,region:row.region||null,postcode:row.postcode||null,country:row.country||null,phone:row.tel||null,website:row.website||null,sourceRefreshedAt:row.date_refreshed?new Date(row.date_refreshed):null,externalProvider:'FSQ_OS',externalId:id,source:'IMPORTED',occupancy:0,capacity:null,rating:null,image:null}};
}
function parseArgs(argv){const fileIndex=argv.indexOf('--file'); if(fileIndex<0||!argv[fileIndex+1]) throw new Error('--file is required'); return {file:path.resolve(argv[fileIndex+1]),dryRun:argv.includes('--dry-run')};}
async function main(){let args;try{args=parseArgs(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;return;} if(!fs.existsSync(args.file)){console.error('Input file not found.');process.exitCode=1;return;} const rows=parseCsv(fs.readFileSync(args.file,'utf8')); const report={recordsRead:rows.length,valid:0,eligible:0,invalid:0,closed:0,flagged:0,unsupportedCategory:0,wouldInsert:0,wouldUpdate:0,inserted:0,updated:0,skipped:0,failed:0}; const normalized=[]; for(const row of rows){const n=normalizeRow(row); if(!n.ok){report.invalid++; if(n.reason==='closed')report.closed++; else if(n.reason==='critical_flag')report.flagged++; else if(n.reason==='unsupported_category')report.unsupportedCategory++; else report.skipped++; continue;} report.valid++;report.eligible++;normalized.push(n.value);}
  if(args.dryRun){const prisma=new PrismaClient(); try{for(const v of normalized){const existing=await prisma.venue.findUnique({where:{externalProvider_externalId:{externalProvider:v.externalProvider,externalId:v.externalId}},select:{id:true}}); existing?report.wouldUpdate++:report.wouldInsert++;}} finally{await prisma.$disconnect();} console.log(JSON.stringify(report)); return;}
  const prisma=new PrismaClient(); try{for(let i=0;i<normalized.length;i+=100){const batch=normalized.slice(i,i+100); for(const v of batch){try{const existing=await prisma.venue.findUnique({where:{externalProvider_externalId:{externalProvider:v.externalProvider,externalId:v.externalId}},select:{id:true}}); const data={...v}; if(existing){await prisma.venue.update({where:{id:existing.id},data});report.updated++;}else{await prisma.venue.create({data});report.inserted++;}}catch(e){report.failed++; console.error(`Failed record ${v.externalId}: ${e.message}`);}}}} finally{await prisma.$disconnect();} console.log(JSON.stringify(report));}
if(require.main===module) main();
module.exports={parseCsv,normalizeCategory,normalizeRow,parseArgs};
