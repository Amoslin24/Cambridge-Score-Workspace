import './analysis-practice-actions-1125.js';
const truth = Number.isFinite;
const fmt = v => truth(v) ? (Math.round(v*10)/10).toString() : '—';
const levels = {A2:'ket',B1:'pet',B2:'fce',Starters:'starters',Movers:'movers',Flyers:'flyers'};
const examLevels=['Starters','Movers','Flyers','A2','B1','B2'];
const yle = x => ['Starters','Movers','Flyers'].includes(x);
const areas = {reading:'阅读', readingWriting:'读写', listening:'听力', useOfEnglish:'语言运用', writing:'写作', speaking:'口语'};
const kinds = {official:'正式',practice:'练习',classroom:'课堂'};
const listening = {
 Starters:['图中人物配对','信息听写','图片选择','颜色与位置指令'],
 Movers:['图中人物配对','信息听写','人与图配对','图片选择','涂色与书写指令'],
 Flyers:['图中人物配对','信息听写','人与图配对','图片选择','涂色与书写指令'],
 A2:['图片选择','信息听写','长对话选择','短对话主旨','信息匹配'],
 B1:['图片选择','短独白或对话理解','信息听写','访谈理解'],
 B2:['短音频理解','句子补全','多项匹配','访谈理解']
};
export function summarize(rows, metric, threshold) {
 const counts=new Map();
 for(const row of rows) counts.set(row.studentId,(counts.get(row.studentId)||0)+1);
 let denominator=0, n=0, low=0, total=0, conflicts=0, absent=0;
 for(const row of rows){
   if(counts.get(row.studentId)!==1)continue;
   if(row.status==='absent'){absent++;continue}
   denominator++;
   const v=metric(row);
   if(truth(v)){n++;total+=v;if(v<threshold)low++}
 }
 for(const num of counts.values())if(num>1)conflicts++;
 return {n,denominator,low,mean:n?total/n:null,conflicts,absent};
}
// A missing score has no scoring structure; match it by sitting, not score shape.
export function comparisonSessions(rows, examKey, structure) {
 const sittings=new Map(), sessions=new Map(), unassigned=new Map();
 for(const row of rows){
   const key=examKey(row);
   if(!sittings.has(key))sittings.set(key,{scored:new Map(),absent:[]});
   const sitting=sittings.get(key);
   if(row.status==='absent'){sitting.absent.push(row);continue;}
   const sig=structure(row);
   if(!sitting.scored.has(sig))sitting.scored.set(sig,[]);
   sitting.scored.get(sig).push(row);
 }
 for(const [key,{scored,absent}] of sittings){
   if(scored.size===0){sessions.set(JSON.stringify([key,null]),absent);continue;}
   const ambiguous=new Set(absent.map(row=>row.studentId)).size;
   for(const [sig,recorded] of scored){
     const id=JSON.stringify([key,sig]);
     sessions.set(id,scored.size===1?[...recorded,...absent]:recorded);
     if(scored.size>1&&ambiguous)unassigned.set(id,ambiguous);
   }
 }
 return {sessions,unassigned};
}
export function createAnalysis(React, d) {
 const h=React.createElement;
 const options = (items, val, set, name) => h('label', {className:'cp-field'},name,h('select',{value:val,onChange:e=>set(e.target.value)},items.map(([k,t])=>h('option',{key:k,value:k},t))));
 const pill = (text,on,click) => h('button',{type:'button',key:text,className:'cp-tab','aria-pressed':on,onClick:click},text);
 const attemptOrder=(a,b)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id));
 const levelOptions=examLevels.filter(id=>d.defs[id]).map(id=>[id,d.defs[id].label]);
 const detailLabel=a=> [a.date||'未填日期',d.defs[a.exam]?.label,kinds[a.kind],a.source].filter(Boolean).join(' · ');
 const grade=a=>a.status==='absent'?null: d.grade(a);
 function layout(row){
   if(row.kind!=='practice')return [];
   const core=d.sections(row).map(g=>({...g,label:areas[g.id]||g.label}));
   const fields=yle(row.exam)?d.profile(row)==='parts2024'?d.yleParts(row.exam,'listening'):d.profile(row)==='items2024'?d.yleItems(row.exam,'listening'):[]:d.defs[row.exam]?.skills.find(x=>x.id==='listening')?.fields||[];
   const map=new Map();
   for(const field of fields){const num=Number(field.id.match(/_p(\d+)/)?.[1]);if(num)map.set(num,[...(map.get(num)||[]),field]);}
   if(map.size)core.push({id:'listening',label:'听力',parts:[...map].sort(([a],[b])=>a-b).map(([part,fields])=>({id:'listening:p'+part,part,label:'Part '+part+' · '+(listening[row.exam]?.[part-1]||'听力'),max:fields.reduce((acc,f)=>acc+f.max*(f.weight??1),0),fields}))});
   return core;
 }
 const percent=(row,def)=>{
   if(row.status==='absent')return null;
   const sum=def.fields.reduce((total,field)=>{
     const v=row.scores[field.id], step=field.step??1;
     if(!truth(total)||!truth(v)||v<0||v>field.max||Math.abs(v/step-Math.round(v/step))>1e-8)return NaN;
     return total+v*(field.weight??1);
   },0);
   return truth(sum)&&def.max>0 ? 100*sum/def.max : null;
 };
 function bar(title,v,end,detail,color){
   return h('div',{key:title,className:'cp-bar'},h('div',{className:'cp-bar-label'},h('span',null,title),h('strong',null,detail)),h('div',{className:'cp-track','aria-hidden':true},truth(v)&&h('span',{style:{width:Math.min(100,100*v/end)+'%',background:color}})));
 }
 const palette=['#233c7b','#117c73','#86511b','#89496c','#574399','#356784'];
 function checklist(level,area,rows,threshold,group){
   const selected=rows.filter(x=>truth(x.value)&&x.value<threshold).sort((a,b)=>a.value-b.value||a.part-b.part);
   if(!rows.some(x=>truth(x.value)))return null;
   return h('section',{className:'cp-queue'},h('h4',null,group?'优先复查':'练习与复查'),h('p',{className:'cp-muted'},selected.length?'低于 '+threshold+'% 的 Part，从低到高。先核对作答，再选练习。':'已录分项均未低于 '+threshold+'%。'),
     selected.length>0&&h('ol',null,selected.map(x=>{
       const action=(area==='listening'?globalThis.LISTENING_ACTIONS:globalThis.PART_ACTIONS)?.[levels[level]]?.[x.part];
       return h('li',{key:x.id},h('div',{className:'cp-bar-label'},h('strong',null,x.label),h('b',null,fmt(x.value)+'%')),group&&h('small',null,'低于线 '+x.low+'/'+x.n+' 人'+(x.n<5?' · 有效样本少，先核对原卷':'')+(x.n<x.denominator?' · 录分未齐':'')),action&&h('p',null,h('b',null,'练习：'),action.practice),action&&h('p',null,h('b',null,'复查：'),action.check));
     })));
 }
 function toggleGroups(names, selected, set, legend, initiallyOpen=false){
   return h('details',{className:'cp-picks',open:initiallyOpen||undefined},h('summary',null,legend+'（已选 '+selected.length+' / '+names.length+'）'),
      h('div',{className:'cp-tabs'},h('button',{type:'button',className:'cp-tab',onClick:()=>set(names.map(([k])=>k))},'全选'),h('button',{type:'button',className:'cp-tab',onClick:()=>set([])},'清空')),
      h('div',{className:'cp-checks'},names.map(([key,text])=>h('label',{key},h('input',{type:'checkbox',checked:selected.includes(key),onChange:()=>set(selected.includes(key)?selected.filter(e=>e!==key):[...selected,key])}),text))));
 }
 const line=(value,set)=>options([40,50,60,70,80].map(n=>[n,n+'%']),value,v=>set(+v),'练习提醒线');
 function metrics(row){
   const info=grade(row);
   return (info?.skills||d.defs[row.exam]?.skills||[]).map(s=>{
     const isY=yle(row.exam), official=row.kind==='official', unit=official?(isY?' 盾牌':' Scale'):'%';
     return {id:s.id,label:areas[s.id]||s.label,unit,end:official?(isY?5:d.ranges[row.exam].max):100,
       value:official?(isY?s.shields:s.scale):s.percent};
   });
 }
 function Student({student,attempts,allAttempts,students,Radar,Trend,onDetail}){
   const sorted=[...attempts].sort(attemptOrder);
   const [key,setKey]=React.useState(''), [lvl,setLevel]=React.useState(''), [area,setArea]=React.useState(''), [threshold,setThreshold]=React.useState(60);
   const [show,setShow]=React.useState(false), [selected,setSelected]=React.useState([]);
   const exam=lvl||sorted[0]?.exam||levelOptions[0][0];
   const sittings=sorted.filter(a=>a.exam===exam);
   const row=sittings.find(a=>a.id===key)||sittings[0];
   const filter=options(levelOptions,exam,v=>{setLevel(v);setKey('');setArea('');setSelected([]);},'考试级别');
   if(!row)return h(React.Fragment,null,h('section',{className:'cp-panel cp-student','aria-label':'学生数据分析'},
     h('header',{className:'cp-head'},h('h3',null,'学生数据分析')),
     h('div',{className:'cp-controls'},filter),h('p',{role:'status'},'该学生暂无 '+d.defs[exam].label+' 成绩。')),h(Trend,{attempts}));

   const scored=grade(row), curriculum=layout(row);
   const section=curriculum.find(x=>x.id===area)||curriculum[0];
   const parts=section?.parts.map(x=>({...x,value:percent(row,x)}))||[];
   const progress=metrics(row);
   const classmates=show?allAttempts.filter(x=>d.examKey(x)===d.examKey(row)&&d.structure(x)===d.structure(row)&&x.status!=='absent'&&x.studentId!==row.studentId):[];
   const buckets=new Map(); for(const a of classmates)buckets.set(a.studentId,[...(buckets.get(a.studentId)||[]),a]);
   const labels=new Map(students.map(x=>[x.id,x.name+(x.className?' · '+x.className:'')]));
   const choices=[...buckets].filter(([k,a])=>a.length===1&&labels.has(k)).map(([k])=>[k,labels.get(k)]).sort((a,b)=>a[1].localeCompare(b[1]));
   const picked=choices.filter(([id])=>selected.includes(id)).map(([id,name])=>[name,buckets.get(id)[0],id]);
   return h(React.Fragment,null,
    h('section',{className:'cp-panel cp-student','aria-label':'学生数据分析'},
     h('header',{className:'cp-head'},h('h3',null,'学生数据分析')),
     h('div',{className:'cp-controls'},filter,options(sittings.map(a=>[a.id,detailLabel(a)]),row.id,v=>{setKey(v);setSelected([]);},'考试场次')),
     h('div',{className:'cp-summary'},row.status==='absent'?h('p',null,'本场缺考'):h(React.Fragment,null,
       !yle(row.exam)&&truth(scored?.overall)&&h('div',{className:'cp-score'},h('span',null,(row.kind==='official'?'正式':'估算')+' Overall Scale'),h('strong',null,scored.overall)),
       ...((scored?.skills||[]).map(s=>{const value=yle(row.exam)?s.shields??s.estimatedShields:s.scale;const unit=yle(row.exam)?' 盾牌':' Scale';return h('div',{key:s.id,className:'cp-score'},h('span',null,areas[s.id]||s.label),h('strong',null,truth(value)?(row.kind==='official'?'':'≈ ')+value+unit:truth(s.raw)?s.raw+' / '+s.max:'—'));}))
     )),
     h(Radar,{attempts:[row],hidePicker:true}),
     h('div',{className:'cp-block'},h('h4',null,'各科表现'),progress.map(m=>bar(m.label,m.value,m.end,truth(m.value)?fmt(m.value)+m.unit:'未记录'))),
     curriculum.length>0?h('div',{className:'cp-block'},h('header',{className:'cp-head'},h('h4',null,'各 Part 得分率'),line(threshold,setThreshold)),
       h('div',{className:'cp-tabs','aria-label':'个人科目'},curriculum.map(x=>pill(x.label,x.id===section.id,()=>setArea(x.id)))),
       parts.map(p=>bar(p.label,p.value,100,truth(p.value)?fmt(p.value)+'%':'未记录',p.value!==null&&p.value<threshold?'#8d552a':undefined)),
       checklist(row.exam,section.id,parts,threshold,false)):h('p',{className:'cp-muted'},'本场无 Part 明细。不会用总分、Scale 或盾牌反推题目表现。'),
     h('div',{className:'cp-tabs'},pill('比较学生',show,()=>setShow(!show)),h('button',{type:'button',className:'cp-tab',onClick:()=>onDetail(row)},'查看原记录')),
     show&&h('section',{className:'cp-block','aria-label':'学生比较'},h('h4',null,'同场学生对比'),h('p',{className:'cp-muted'},'只比较同一场考试、同一计分口径。缺项不补零。'),
       choices.length?toggleGroups(choices,selected,setSelected,'选择学生'):h('p',null,'没有可比较的同场学生记录。'),
       picked.length>0&&h(React.Fragment,null,(parts.length?parts:progress).map(m=>h('div',{key:m.id,className:'cp-compare-part'},h('strong',null,m.label),
         ...[[student.name,row,row.studentId],...picked].map(([name,a,id],i)=>{const value=parts.length?percent(a,m):metrics(a).find(k=>k.id===m.id)?.value;return h('div',{key:id},bar(name,value,m.end||100,truth(value)?fmt(value)+(m.unit||'%'):'未记录',palette[i%palette.length]));})))))),
    h(Trend,{attempts}));
 }
 function Class({students,attempts,Native,onDetail}){
   const [mode,setMode]=React.useState('home'),[group,setGroup]=React.useState('set'),[lvl,setLevel]=React.useState(''),[which,setWhich]=React.useState(''),[area,setArea]=React.useState(''),[selected,setSelected]=React.useState(null),[threshold,setThreshold]=React.useState(60);
   const labels=new Set(students.map(s=>s.id));
   const relevant=mode==='compare'?[...attempts].sort(attemptOrder).filter(a=>labels.has(a.studentId)&&d.defs[a.exam]):[];
   const {sessions,unassigned}=comparisonSessions(relevant,d.examKey,d.structure);
   const groupName=a=>(group==='set'?a.setAtExam:a.classAtExam)||'归属未记录';
   const selectedRows=selected===null?relevant:relevant.filter(a=>selected.includes(groupName(a)));
   const exam=lvl||selectedRows[0]?.exam||relevant[0]?.exam||levelOptions[0][0];
   const possible=[...sessions].filter(([,a])=>a[0].exam===exam);
   const same=!which.startsWith('recent:');
   const matches=selected===null?possible:possible.filter(([,a])=>a.some(x=>selected.includes(groupName(x))));
   const session=matches.find(([k])=>k===which)||matches[0];
   const scored=possible.filter(([,a])=>a.some(x=>x.status!=='absent'));
   const schemes=[...new Set(scored.map(([k])=>JSON.parse(k)[1]))];
   const coverage=new Map(schemes.map(id=>[id,new Set()]));
   for(const [key,rows] of scored)for(const a of rows){
     const name=groupName(a);
     if(a.status!=='absent'&&(selected===null||selected.includes(name)))coverage.get(JSON.parse(key)[1]).add(name);
   }
   const defaultScheme=[...schemes].sort((a,b)=>coverage.get(b).size-coverage.get(a).size)[0];
   const chosenScheme=same?'':which.slice('recent:'.length);
   const sig=schemes.includes(chosenScheme)?chosenScheme:defaultScheme||'';
   const compatible=scored.filter(([k])=>JSON.parse(k)[1]===sig);
   const seedRows=(same?session:compatible[0])?.[1]||[];
   const seed=seedRows.find(a=>a.status!=='absent')||seedRows[0];
   const registered=students.map(a=>group==='set'?a.setName:a.className).filter(Boolean);
   const groupNames=[...new Set([...registered,...relevant.map(groupName)])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
   const groupEntries=new Map(groupNames.map(n=>[n,same?(session?.[1].some(a=>groupName(a)===n)?session:null):compatible.find(([,a])=>a.some(x=>groupName(x)===n&&x.status!=='absent'))]));
   const groups=selected===null?groupNames:groupNames.filter(n=>selected.includes(n));
   const groupsWithData=groups.filter(n=>groupEntries.get(n));
   const curriculum=seed?layout(seed):[];
   const section=area==='whole'?null:curriculum.find(x=>x.id===area)||curriculum[0];
   const records=section?.parts||[];
   const whole=seed?metrics(seed):[];
   const cleanCache=new Map();
   function recordsFor(entry){
     if(!entry)return {rows:[],duplicates:0};
     if(cleanCache.has(entry[0]))return cleanCache.get(entry[0]);
     const count=new Map();
     for(const row of entry[1])count.set(row.studentId,(count.get(row.studentId)||0)+1);
     const info={rows:entry[1].filter(row=>count.get(row.studentId)===1),duplicates:[...count.values()].filter(n=>n>1).length};
     cleanCache.set(entry[0],info); return info;
   }
   const groupRows=new Map(groups.map(n=>{
     const entry=groupEntries.get(n), cleaned=recordsFor(entry);
     return [n,{...cleaned,rows:cleaned.rows.filter(row=>groupName(row)===n)}];
   }));
   const measures=records.length?records:whole;
   const measure=(a,m)=>records.length?percent(a,m):metrics(a).find(x=>x.id===m.id)?.value;
   const byMetric=new Map(measures.map(m=>[m.id,new Map(groupsWithData.map(n=>[n,summarize(groupRows.get(n).rows,a=>measure(a,m),records.length?threshold:-Infinity)]))]));
   const overall=records.map(m=>{const {mean,...stats}=summarize(recordsFor(session).rows.filter(a=>groupsWithData.includes(groupName(a))),a=>percent(a,m),threshold);return {...m,...stats,value:mean};});
   function schemeLabel(id){
     const [,kind,profile,custom]=JSON.parse(id);
     const label={parts2024:'按 Part',items2024:'逐题录入',legacyV7:'旧版',totals:'科目总分',criteria:'评分维度',tasks:'写作任务总分','combined-reading-writing':'读写合并','legacy-separate-reading-writing':'读写分列'}[profile];
     return [kinds[kind],label,custom?.length?'自定义满分 '+custom.map(([k,v])=>k.replace(/_max$/,'')+' '+v).join(' / '):null].filter(Boolean).join(' · ');
   }
   const levelsControl=options(levelOptions,exam,v=>{setLevel(v);setWhich('');setArea('');},'考试级别');
   const optionLabels=matches.map(([,a])=>detailLabel(a.find(x=>x.status!=='absent')||a[0]));
   const sittingOptions=matches.map(([k],i)=>[k,optionLabels[i]+(optionLabels.filter(v=>v===optionLabels[i]).length>1?' · 记录组 '+(i+1):'')]);
   const recentOptions=groups.length>1?schemes.filter(id=>coverage.get(id).size>1).map(id=>['recent:'+id,'各组最近一场 · '+schemeLabel(id)]):[];
   const selectedSitting=same?(session?.[0]||''):recentOptions.some(([k])=>k===which)?which:'';
   const sittingControl=options(sittingOptions.length?[...sittingOptions,...recentOptions]:[['','暂无可选场次']],selectedSitting||sittingOptions[0]?.[0]||'',v=>{setWhich(v);setArea('');},'考试场次');
   const selectedStatus=groups.length===0?'请选择至少一个班级或 SET。':groupsWithData.length===0?'所选班级或 SET 暂无可比的 '+d.defs[exam].label+' 成绩。':null;
   return h(React.Fragment,null,
     h('div',{className:'cp-tabs cp-navigation','aria-label':'班级视图'},pill('班级成绩',mode==='home',()=>setMode('home')),pill('班级 / SET 对比',mode==='compare',()=>setMode('compare'))),
     h('div',{hidden:mode!=='home'},h(Native,{students,attempts,onDetail})),
     mode==='compare'&&h('section',{className:'cp-panel','aria-label':'班级成绩对比'},
       h('header',{className:'cp-head'},h('h2',null,'班级成绩对比')),
       h('div',{className:'cp-controls'},options([['set','教学 SET'],['class','行政班']],group,v=>{setGroup(v);setSelected(null);setWhich('');},'分组')),
       groupNames.length>0&&toggleGroups(groupNames.map(n=>[n,n]),groups,v=>{setSelected(v);if(which.startsWith('recent:'))setWhich('');},group==='set'?'选择 SET':'选择行政班'),
       h('div',{className:'cp-controls'},levelsControl,sittingControl),
       !seed?h('p',{role:'status'},same&&possible.length?(selectedStatus||'所选班级或 SET 暂无可比场次。'):'暂无 '+d.defs[exam].label+' 成绩。'):h(React.Fragment,null,
       same?h('p',{className:'cp-muted'},'按考试时归属统计；只比较同场同口径。'):h('p',{className:'cp-muted'},'各组选最近一场同计分口径的成绩。不同试卷难度可能不同，差距不等于水平差距。'),
       same&&recordsFor(session).duplicates>0&&h('p',{className:'cp-muted'},'同场有重复成绩 '+recordsFor(session).duplicates+' 人，暂不纳入比较。'),
       same&&unassigned.has(session[0])&&h('p',{className:'cp-muted'},'本场有多种计分口径，'+unassigned.get(session[0])+' 人的缺考记录不分配到单个记录组。'),
       !same&&groupsWithData.length>0&&h('p',{className:'cp-muted'},groupsWithData.map(n=>{
         const groupRecords=groupEntries.get(n)[1],first=groupRecords.find(a=>a.status!=='absent');
         return n+'：'+detailLabel(first);
       }).join('；')),
       curriculum.length>0&&h('div',{className:'cp-head'},h('div',{className:'cp-tabs','aria-label':'班级科目'},...curriculum.map(x=>pill(x.label,x.id===section?.id,()=>setArea(x.id))),pill('各科总览',!section,()=>setArea('whole'))),records.length>0&&line(threshold,setThreshold)),
       selectedStatus?h('p',{role:'status'},selectedStatus):h(React.Fragment,null,
         groups.length>groupsWithData.length&&h('p',{className:'cp-muted'},(groups.length-groupsWithData.length)+' 个已选分组无本次可比成绩。'),
         !curriculum.length&&h('p',{className:'cp-muted'},'仅显示已录入的科目成绩，不推算 Part。'),
         ...measures.map(m=>h('section',{key:m.id,className:'cp-compare-part'},h('h3',null,m.label),
            groupsWithData.map((g,i)=>{const s=byMetric.get(m.id).get(g);return h('div',{key:g},bar(g,s.mean,m.end||100,(truth(s.mean)?fmt(s.mean)+(m.unit||'%'):'未记录')+' · '+s.n+'/'+s.denominator+' 人',palette[i%palette.length]),
              (s.absent>0||(records.length>0&&s.low>0))&&h('small',{className:'cp-muted'},[s.low>0?'低于线 '+s.low+' 人':null,s.absent?'缺考 '+s.absent+' 人':null].filter(Boolean).join(' · ')));}))),
         records.length>0&&(same?checklist(exam,section.id,overall,threshold,true):h('section',{className:'cp-block'},h('h4',null,'各组复查建议'),...groupsWithData.map(g=>h('details',{key:g,className:'cp-picks'},h('summary',null,g),checklist(exam,section.id,records.map(m=>{const s=byMetric.get(m.id).get(g);return {...m,...s,value:s.mean};}),threshold,true)||h('p',null,'暂无有效 Part 成绩。')))))))));
 }
 return {Student,Class};
}
