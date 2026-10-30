import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {membersOf,descriptionMembers,dateOf,validate,safeThumbnail} from './search-common.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source="radio";
const config={livestreams:['data/livestreams.js','LIVESTREAMS'],radio:['data/archive-data.js','RADIO_ARCHIVE_DATA'],scans:['data.js','SCANS_DATA'],events:['app/data/archive.generated.json','']}[source];
const text=readFileSync(resolve(root,config[0]),'utf8');
const data=JSON.parse(config[1]?text.slice(text.indexOf('window.'+config[1]) + ('window.'+config[1]).length).replace(/^\s*=\s*/u,'').replace(/;\s*$/u,''):text);
const base='https://tbzarchive.com/';let records=[];
const driveThumbnail=id=>id?'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w320':'';
const eventTools=source==='events'?await import('./archive-tools.mjs'):null;
function add(id,title,description,members,dates,platform,type,url,count,tags=[],thumbnail=''){records.push({id:source+':'+id,collection:source,title:title||'Untitled',description:description||'',members:[...new Set(members)],...dates,platform:platform||'',type,url,itemCount:count??null,tags,thumbnail:safeThumbnail(thumbnail)});}
if(source==='livestreams')for(const r of data){
 let dates=dateOf(r.date,r.year);
 // Old exports use Jan 1 as an unknown-date fallback. Do not invent an exact day.
 if(r.datePrecision==='year'||(r.date?.endsWith('-01-01')&&!r.datePrecision))dates={date:String(r.year),datePrecision:'year'};
 const p=new URLSearchParams({year:String(r.year),q:r.title,item:r.watch||r.id});
 add(r.watch||r.id,r.title,r.description,membersOf(r.members+' '+(r.tags||'')),dates,r.platform,'Livestream',base+'livestream-archive/?'+p,null,r.tags?[String(r.tags)]:[],r.thumbnail);
}
if(source==='radio')for(const s of data.series)for(const r of s.entries){
 add(s.id+':'+r.id,r.title,r.description||[s.title,r.episode?'Episode '+r.episode:'',r.guests?.length?'Guests: '+r.guests.join(', '):''].filter(Boolean).join(' · '),membersOf([...(r.members||[]),...(r.djs||[]),...descriptionMembers(r.description),r.title].join(' ')),dateOf(r.date,r.year),'Radio','Radio episode',base+'radio-archive/#episode/'+encodeURIComponent(s.id)+'/'+encodeURIComponent(r.id),r.media?.length,[s.title,...(r.guests||[])],driveThumbnail(r.media?.find(m=>m.mimeType?.startsWith('image/'))?.id));
}
if(source==='scans')for(const c of data.collections)for(const r of c.galleries){
 add(r.id,r.name,r.description||c.nameEn,membersOf([r.name,...descriptionMembers(r.description),...r.groups.map(g=>g.name)].join(' ')),dateOf(r.name,r.releaseYear),'',c.nameEn,base+'scans/'+c.slug+'/index.html?item='+encodeURIComponent(r.id),r.imageCount,[c.nameEn],driveThumbnail(r.coverId||r.groups.flatMap(g=>g.images).find(i=>i.id)?.id));
}
if(source==='events')for(const f of data.nodes.filter(n=>n.type==='folder'&&n.path.length===1)){
 const files=data.nodes.filter(n=>n.type==='file'&&(Array.isArray(n.folderIds)?n.folderIds.includes(f.id):[...f.path,f.name].every((part,i)=>n.path[i]===part)));
 const explicit=membersOf([f.name,...descriptionMembers(f.description)].join(' '));
 add(f.id,f.name,f.description||'',explicit.length?explicit:membersOf(files.map(x=>x.name).join(' ')),dateOf(f.name),'','Event',base+'events/#event/'+encodeURIComponent(f.id),files.length,[],driveThumbnail(eventTools.photoCover(eventTools.sortMedia(files))?.id));
}
// A repeated watch URL represents one livestream, even when repeated in a workbook.
const unique=new Map();for(const r of records){const prev=unique.get(r.id);if(prev){prev.members=[...new Set([...prev.members,...r.members])];prev.tags=[...new Set([...prev.tags,...r.tags])];if(!prev.description)prev.description=r.description;if(!prev.thumbnail)prev.thumbnail=r.thumbnail;}else unique.set(r.id,r);}records=[...unique.values()];
const index=validate({schemaVersion:1,source,generatedAt:new Date().toISOString(),sourceUpdatedAt:data.generatedAt||data.updatedAt||null,records},source);
const output=source==='events'?'public/search-index.json':'search-index.json';mkdirSync(resolve(root,source==='events'?'public':'.'),{recursive:true});writeFileSync(resolve(root,output),JSON.stringify(index));console.log(source+': '+records.length+' records');
