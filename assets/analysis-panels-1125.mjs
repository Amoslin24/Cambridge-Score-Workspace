import './analysis-practice-actions-1125.js';
const truth = Number.isFinite;
const fmt = v => truth(v) ? (Math.round(v*10)/10).toString() : '—';
const levels = {A2:'ket',B1:'pet',B2:'fce',Starters:'starters',Movers:'movers',Flyers:'flyers'};
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
export function createAnalysis(React, d) {
 const h=React.createElement;
 const options = (items, val, set, name) => h('label', {className:'cp-field'},name,h('select',{value:val,onChange:e=>set(e.target.value)},items.map(([k,t])=>h('option',{key:k,value:k},t))));
 const pill = (text,on,click) => h('button',{type:'button',key:text,className:'cp-tab','aria-pressed':on,onClick:click},text);
 const attemptOrder=(a,b)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id));
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
 function toggleGroups(names, selected, set, legend){
   return h('details',{className:'cp-picks',open:undefined},h('summary',null,legend+'（已选 '+selected.length+' / '+names.length+'）'),
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
   const [key,setKey]=React.useState(''), [area,setArea]=React.useState(''), [threshold,setThreshold]=React.useState(60);
   const [show,setShow]=React.useState(false), [selected,setSelected]=React.useState([]);
   const row=sorted.find(a=>a.id===key)||sorted[0];
   if(!row)return null;
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
     h('header',{className:'cp-head'},h('h3',null,'学生数据分析'),options(sorted.map(a=>[a.id,detailLabel(a)]),row.id,v=>{setKey(v);setSelected([]);},'考试场次')),
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
   const sessions=new Map();
   if(mode==='compare')for(const a of [...attempts].sort(attemptOrder)){
     if(!labels.has(a.studentId)||!d.defs[a.exam])continue;
     const key=JSON.stringify([d.examKey(a),d.structure(a)]);
     if(!sessions.has(key))sessions.set(key,[]);
     sessions.get(key).push(a);
   }
   const levelsFound=[...new Set([...sessions.values()].map(a=>a[0].exam))];
   const exam=levelsFound.includes(lvl)?lvl:levelsFound[0]||'';
   const possible=[...sessions].filter(([,a])=>a[0].exam===exam);
   const session=possible.find(([k])=>k===which)||possible[0];
   const rows=session?.[1]||[], seed=rows.find(a=>a.status!=='absent')||rows[0];
   const groupName=a=>(group==='set'?a.setAtExam:a.classAtExam)||'归属未记录';
   const groupNames=[...new Set(rows.map(groupName))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
   const groups=groupNames.filter(n=>selected===null||selected.includes(n));
   const curriculum=seed?layout(seed):[];
   const section=area==='whole'?null:curriculum.find(x=>x.id===area)||curriculum[0];
   const records=section?.parts||[];
   const whole=seed?metrics(seed):[];
   const occurrence=new Map(); for(const row of rows)occurrence.set(row.studentId,(occurrence.get(row.studentId)||0)+1);
   const duplicateCount=[...occurrence.values()].filter(n=>n>1).length;
   const grouped=new Map(groups.map(g=>[g,rows.filter(a=>groupName(a)===g&&occurrence.get(a.studentId)===1)]));
   const byMetric=new Map((records.length?records:whole).map(m=>[m.id,new Map(groups.map(g=>[g,summarize(grouped.get(g),a=>records.length?percent(a,m):metrics(a).find(x=>x.id===m.id)?.value,records.length?threshold:-Infinity)]))]));
   const overall=records.map(m=>{const {mean,...stats}=summarize(rows.filter(a=>groups.includes(groupName(a))&&occurrence.get(a.studentId)===1),a=>percent(a,m),threshold);return {...m,...stats,value:mean};});
   return h(React.Fragment,null,
     h('div',{className:'cp-tabs cp-navigation','aria-label':'班级视图'},pill('班级成绩',mode==='home',()=>setMode('home')),pill('班级 / SET 对比',mode==='compare',()=>setMode('compare'))),
     h('div',{hidden:mode!=='home'},h(Native,{students,attempts,onDetail})),
     mode==='compare'&&h('section',{className:'cp-panel','aria-label':'班级成绩对比'},
       h('header',{className:'cp-head'},h('h2',null,'班级成绩对比')),
       !seed?h('p',null,'暂无考试成绩。录入后可按考试级别、场次和考试时的归属比较。'):h(React.Fragment,null,
       h('div',{className:'cp-controls'},options(levelsFound.map(x=>[x,d.defs[x].label]),exam,v=>{setLevel(v);setWhich('');setSelected(null);},'考试级别'),
       options(possible.map(([k,a],i)=>[k,detailLabel(a[0])+(possible.filter(([,b])=>detailLabel(b[0])===detailLabel(a[0])).length>1?' · 记录组 '+(i+1):'')]),session[0],v=>{setWhich(v);setSelected(null);},'考试场次'),
       options([['set','教学 SET'],['class','行政班']],group,v=>{setGroup(v);setSelected(null);},'比较维度')),
       h('p',{className:'cp-muted'},'按考试时归属统计，只比同场同口径。有效人数按已登记且未缺考的学生计算。'),
       duplicateCount>0&&h('p',{className:'cp-muted'},'同场有重复成绩 '+duplicateCount+' 人，暂不纳入比较。'),
       toggleGroups(groupNames.map(n=>[n,n]),groups,setSelected,group==='set'?'选择 SET':'选择行政班'),
       curriculum.length>0&&h('div',{className:'cp-head'},h('div',{className:'cp-tabs','aria-label':'班级科目'},...curriculum.map(x=>pill(x.label,x.id===section?.id,()=>setArea(x.id))),pill('各科总览',!section,()=>setArea('whole'))),records.length>0&&line(threshold,setThreshold)),
       groups.length===0?h('p',{role:'status'},'请选择至少一个班级或 SET。'):h(React.Fragment,null,
         !curriculum.length&&h('p',{className:'cp-muted'},'本场只展示已录入的科目成绩，不推算 Part。'),
         ...(records.length?records:whole).map(m=>h('section',{key:m.id,className:'cp-compare-part'},h('h3',null,m.label),
            groups.map((g,i)=>{const s=byMetric.get(m.id).get(g);return h('div',{key:g},bar(g,s.mean,m.end||100,(truth(s.mean)?fmt(s.mean)+(m.unit||'%'):'未记录')+' · '+s.n+'/'+s.denominator+' 人',palette[i%palette.length]),
              (s.conflicts>0||s.absent>0||(records.length>0&&s.low>0))&&h('small',{className:'cp-muted'},[s.low>0?'低于线 '+s.low+' 人':null,s.absent?'缺考 '+s.absent+' 人':null,s.conflicts?'重复记录 '+s.conflicts+' 人，已排除':null].filter(Boolean).join(' · ')));}))),
         records.length>0&&checklist(exam,section.id,overall,threshold,true)))));
 }
 return {Student,Class};
}
