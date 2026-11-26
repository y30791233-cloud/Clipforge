const $ = id => document.getElementById(id);
const els = {
  url:$('videoUrl'), load:$('loadUrl'), file:$('fileInput'), video:$('video'),
  editor:$('editor'), empty:$('videoEmpty'), meta:$('sourceMeta'), current:$('currentTime'),
  duration:$('durationLabel'), start:$('startTime'), end:$('endTime'), startRange:$('startRange'),
  endRange:$('endRange'), band:$('selectionBand'), selected:$('selectedDuration'),
  preview:$('previewSelection'), videoMode:$('videoMode'), audioMode:$('audioMode'),
  format:$('outputFormat'), quality:$('quality'), bitrate:$('bitrate'), videoOptions:$('videoOptions'),
  audioOptions:$('audioOptions'), process:$('process'), cancel:$('cancel'), progressArea:$('progressArea'),
  progressText:$('progressText'), progressPercent:$('progressPercent'), progressBar:$('progressBar'),
  progressDetail:$('progressDetail'), result:$('result'), resultMeta:$('resultMeta'),
  download:$('download'), clearOutput:$('clearOutput'), estimateDuration:$('estimateDuration'),
  estimateSize:$('estimateSize'), status:$('status'), theme:$('themeToggle')
};

let sourceBlob=null, sourceName='clip', sourceURL='', duration=0, sourceHeight=0, sourceWidth=0;
let outputURL=null, ffmpeg=null, processing=false, mode='video', previewEndTimer=null, ffmpegReady=false;
const formatOptions = {
  video:[['mp4','MP4 · H.264 + AAC'],['webm','WebM · VP9 + Opus'],['mov','MOV · H.264 + AAC']],
  audio:[['mp3','MP3'],['m4a','M4A · AAC'],['aac','AAC'],['wav','WAV'],['ogg','OGG · Vorbis'],['flac','FLAC']]
};
const qualityHeights=[144,240,360,480,720,1080,1440,2160];

function fmt(sec){
  sec=Math.max(0,Math.floor(Number(sec)||0));
  const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
  return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
}
function parseTime(value){
  const parts=String(value).trim().split(':');
  if(parts.length!==3||parts.some(p=>!/^\d+$/.test(p))) return NaN;
  const [h,m,s]=parts.map(Number);
  if(m>59||s>59) return NaN;
  return h*3600+m*60+s;
}
function niceBytes(bytes){
  if(!Number.isFinite(bytes)||bytes<0)return '—';
  if(bytes<1024)return `${Math.round(bytes)} B`;
  const units=['KB','MB','GB','TB'];let n=bytes/1024,i=0;
  while(n>=1024&&i<units.length-1){n/=1024;i++;}
  return `${n.toFixed(n>=100?0:n>=10?1:2)} ${units[i]}`;
}
function setStatus(message='',kind='error'){
  els.status.textContent=message;
  els.status.style.color=kind==='success'?'var(--accent)':kind==='info'?'var(--muted)':'var(--danger)';
}
function setProgress(percent,text,detail=''){
  const p=Math.max(0,Math.min(100,Math.round(percent||0)));
  els.progressArea.classList.remove('hidden');
  els.progressBar.style.width=p+'%';els.progressPercent.textContent=p+'%';
  els.progressText.textContent=text;els.progressDetail.textContent=detail;
}
function selectedStart(){return parseTime(els.start.value);}
function selectedEnd(){return parseTime(els.end.value);}
function validateRange(show=true){
  const a=selectedStart(),b=selectedEnd();
  const valid=Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a&&b<=duration;
  if(show&&!valid)setStatus('Check the trim range: use HH:MM:SS, start must be before end, and end cannot exceed the source duration.');
  return valid;
}
function updateTrimUI(){
  if(!duration)return;
  let a=selectedStart(),b=selectedEnd();
  if(!Number.isFinite(a))a=0;if(!Number.isFinite(b))b=duration;
  const pa=Math.max(0,Math.min(100,a/duration*100)),pb=Math.max(0,Math.min(100,b/duration*100));
  els.startRange.value=pa;els.endRange.value=pb;
  els.band.style.left=pa+'%';els.band.style.width=Math.max(0,pb-pa)+'%';
  els.selected.textContent='Selected '+fmt(Math.max(0,b-a));
  els.estimateDuration.textContent=fmt(Math.max(0,b-a));
  updateEstimate();
}
function updateEstimate(){
  const a=selectedStart(),b=selectedEnd(),d=Math.max(0,b-a);
  if(!Number.isFinite(d)||d<=0){els.estimateSize.textContent='—';return;}
  if(mode==='audio'){
    const f=els.format.value;
    if(f==='wav')els.estimateSize.textContent=niceBytes(d*sourceBlobSizeRate());
    else if(f==='flac')els.estimateSize.textContent='Variable (lossless)';
    else els.estimateSize.textContent=niceBytes(d*(Number(els.bitrate.value)*1000/8));
  }else{
    const rate=sourceBlobSizeRate();
    const ratio=sourceBlob&&duration?Math.min(1,Math.max(.08,d/duration)):1;
    els.estimateSize.textContent=sourceBlob?niceBytes(sourceBlob.size*ratio):'—';
  }
}
function sourceBlobSizeRate(){
  return sourceBlob&&duration?sourceBlob.size/duration:176400;
}
function updateQuality(){
  els.quality.innerHTML='';
  const original=document.createElement('option');original.value='original';original.textContent=`Original (${sourceHeight||'unknown'}p)`;els.quality.append(original);
  qualityHeights.filter(h=>h<=sourceHeight).forEach(h=>{
    const o=document.createElement('option');o.value=String(h);o.textContent=({720:'720p HD',1080:'1080p Full HD',1440:'1440p QHD',2160:'2160p 4K UHD'}[h]||`${h}p`);
    els.quality.append(o);
  });
  els.quality.value='original';
}
function updateFormatOptions(){
  els.format.innerHTML='';
  (formatOptions[mode]).forEach(([value,label])=>{
    const o=document.createElement('option');o.value=value;o.textContent=label;els.format.append(o);
  });
  els.videoOptions.classList.toggle('hidden',mode==='audio');
  els.audioOptions.classList.toggle('hidden',mode!=='audio');
  els.videoMode.classList.toggle('active',mode==='video');els.audioMode.classList.toggle('active',mode==='audio');
  els.process.textContent=mode==='audio'?'Extract audio →':'Process video →';
  updateEstimate();
}
function releaseOutput(){
  if(outputURL){URL.revokeObjectURL(outputURL);outputURL=null;}
  els.result.classList.add('hidden');els.download.removeAttribute('href');
}
function resetSource(){
  if(sourceURL){URL.revokeObjectURL(sourceURL);sourceURL='';}
  sourceBlob=null;duration=0;sourceHeight=0;sourceWidth=0;
  els.video.pause();els.video.removeAttribute('src');els.video.load();
  els.editor.classList.add('hidden');els.empty.classList.remove('hidden');
  releaseOutput();setStatus('');
}
async function loadBlob(blob,name){
  resetSource();
  if(!blob||!blob.size)throw new Error('The selected source is empty or unavailable.');
  if(blob.size>1.5*1024*1024*1024)throw new Error('This file is over 1.5 GB. Browser memory may not be sufficient; try a smaller file.');
  sourceBlob=blob;sourceName=(name||'clip').replace(/\.[^.]+$/,'').replace(/[^\w.-]+/g,'_').slice(0,80)||'clip';
  sourceURL=URL.createObjectURL(blob);
  els.video.src=sourceURL;els.video.load();
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Timed out reading video metadata. The file may use an unsupported codec.')),20000);
    els.video.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};
    els.video.onerror=()=>{clearTimeout(timeout);reject(new Error('The browser cannot preview this media codec. Try a browser-supported MP4 or WebM file.'));};
  });
  duration=els.video.duration;sourceHeight=els.video.videoHeight||0;sourceWidth=els.video.videoWidth||0;
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Could not determine media duration.');
  els.start.value='00:00:00';els.end.value=fmt(duration);
  els.duration.textContent=fmt(duration);els.current.textContent='00:00:00';
  els.meta.textContent=`${sourceWidth}×${sourceHeight} · ${niceBytes(blob.size)}`;
  updateQuality();updateTrimUI();els.editor.classList.remove('hidden');els.empty.classList.add('hidden');
  els.process.disabled=false;setStatus('Source loaded. Processing will happen locally in this tab.','success');
}
async function loadDirectURL(){
  const raw=els.url.value.trim();
  if(!raw){setStatus('Paste a direct video file URL first.');return;}
  let u;try{u=new URL(raw);}catch{setStatus('That URL is not valid.');return;}
  if(!['http:','https:'].includes(u.protocol)){setStatus('Only http and https direct media URLs are supported.');return;}
  setStatus('Fetching source through your browser…','info');els.load.disabled=true;
  try{
    const response=await fetch(u.href,{mode:'cors',credentials:'omit'});
    if(!response.ok)throw new Error(`The source server returned HTTP ${response.status}.`);
    const type=response.headers.get('content-type')||'';
    if(type.includes('text/html'))throw new Error('This URL returns a webpage, not a direct video file. Platform pages are not supported.');
    const blob=await response.blob();
    if(type&&!type.startsWith('video/')&&!type.startsWith('audio/')&&!type.includes('octet-stream')){
      throw new Error(`The URL returned ${type}, not a recognizable media file.`);
    }
    await loadBlob(blob,decodeURIComponent(u.pathname.split('/').pop()||'video'));
  }catch(e){
    const msg=e instanceof TypeError?'Browser access was blocked (often CORS). Try downloading the video legally and selecting the local file.':e.message;
    setStatus(msg);
  }finally{els.load.disabled=false;}
}
function setMode(next){mode=next;updateFormatOptions();}
function syncFromRange(which){
  const value=Number(which==='start'?els.startRange.value:els.endRange.value)/100*duration;
  if(which==='start'){
    const end=selectedEnd();els.start.value=fmt(Math.min(value,Math.max(0,end-1)));
  }else{
    const start=selectedStart();els.end.value=fmt(Math.max(value,Math.min(duration,start+1)));
  }
  updateTrimUI();
}
els.startRange.addEventListener('input',()=>syncFromRange('start'));
els.endRange.addEventListener('input',()=>syncFromRange('end'));
els.start.addEventListener('change',()=>{
  const a=parseTime(els.start.value);
  if(Number.isFinite(a)&&a>=0&&a<selectedEnd()&&a<=duration){els.start.value=fmt(a);updateTrimUI();}
  else validateRange();
});
els.end.addEventListener('change',()=>{
  const b=parseTime(els.end.value);
  if(Number.isFinite(b)&&b>selectedStart()&&b<=duration){els.end.value=fmt(b);updateTrimUI();}
  else validateRange();
});
els.video.addEventListener('timeupdate',()=>{
  els.current.textContent=fmt(els.video.currentTime);
  if(previewEndTimer&&els.video.currentTime>=selectedEnd()){els.video.pause();previewEndTimer=false;}
});
els.preview.addEventListener('click',async()=>{
  if(!validateRange())return;
  els.video.currentTime=selectedStart();previewEndTimer=true;
  try{await els.video.play();}catch{setStatus('Playback could not start. Press play in the video controls.');}
});
els.file.addEventListener('change',async()=>{
  const f=els.file.files?.[0];if(!f)return;
  try{await loadBlob(f,f.name);}catch(e){resetSource();setStatus(e.message);}
});
els.load.addEventListener('click',loadDirectURL);
els.url.addEventListener('keydown',e=>{if(e.key==='Enter')loadDirectURL();});
els.videoMode.addEventListener('click',()=>setMode('video'));
els.audioMode.addEventListener('click',()=>setMode('audio'));
els.quality.addEventListener('change',updateEstimate);
els.format.addEventListener('change',updateEstimate);
els.bitrate.addEventListener('change',updateEstimate);

async function loadFFmpeg(){
  if(ffmpegReady&&ffmpeg)return;
  setProgress(0,'Loading FFmpeg…','The open-source processing engine is downloaded only when you start a job.');
  const {FFmpeg}=await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js');
  const {toBlobURL}=await import('https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js');
  ffmpeg=new FFmpeg();
  ffmpeg.on('log',({message})=>{els.progressDetail.textContent=message.slice(0,180);});
  ffmpeg.on('progress',({progress})=>{
    if(Number.isFinite(progress))setProgress(8+Math.max(0,Math.min(1,progress))*87,'Processing media…','FFmpeg is running locally in your browser.');
  });
  const base='https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
  const coreURL=await toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript');
  const wasmURL=await toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm');
  await ffmpeg.load({coreURL,wasmURL});
  ffmpegReady=true;
}
function extForMime(ext){return ({mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac'})[ext]||'application/octet-stream';}
function getArgs(){
  const start=selectedStart(),end=selectedEnd(),span=end-start,ext=els.format.value;
  const args=['-i','input.bin','-ss',String(start),'-t',String(span)];
  if(mode==='audio'){
    args.push('-vn');
    const kbps=els.bitrate.value;
    if(ext==='mp3')args.push('-c:a','libmp3lame','-b:a',`${kbps}k`);
    else if(ext==='m4a'||ext==='aac')args.push('-c:a','aac','-b:a',`${kbps}k`);
    else if(ext==='wav')args.push('-c:a','pcm_s16le');
    else if(ext==='ogg')args.push('-c:a','libvorbis','-b:a',`${kbps}k`);
    else if(ext==='flac')args.push('-c:a','flac');
  }else{
    args.push('-map','0:v:0','-map','0:a?');
    const q=els.quality.value;
    if(q!=='original'){
      const h=Number(q);
      const target=Math.min(h,sourceHeight);
      args.push('-vf',`scale=-2:${target}`);
    }
    if(ext==='mp4'||ext==='mov')args.push('-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','aac','-b:a','192k','-movflags','+faststart');
    else if(ext==='webm')args.push('-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','6','-crf','32','-b:v','0','-c:a','libopus','-b:a','128k');
  }
  args.push('-y',`output.${ext}`);
  return args;
}
els.process.addEventListener('click',async()=>{
  if(processing||!sourceBlob)return;
  if(!validateRange())return;
  const ext=els.format.value;
  if(mode==='video'&&sourceHeight===0){setStatus('This source has no detected video track. Switch to Audio only.');return;}
  processing=true;els.process.disabled=true;els.cancel.classList.remove('hidden');els.progressArea.classList.remove('hidden');releaseOutput();setStatus('');
  try{
    await loadFFmpeg();
    if(!processing)return;
    setProgress(5,'Preparing input…','Writing the selected source into temporary browser memory.');
    await ffmpeg.writeFile('input.bin',new Uint8Array(await sourceBlob.arrayBuffer()));
    if(!processing)throw new Error('Processing cancelled.');
    setProgress(8,'Encoding…','The browser may need significant memory for large files.');
    await ffmpeg.exec(getArgs());
    if(!processing)throw new Error('Processing cancelled.');
    const data=await ffmpeg.readFile(`output.${ext}`);
    const outBlob=new Blob([data.buffer],{type:extForMime(ext)});
    outputURL=URL.createObjectURL(outBlob);
    els.download.href=outputURL;els.download.download=`${sourceName}_${fmt(selectedStart()).replaceAll(':','-')}-${fmt(selectedEnd()).replaceAll(':','-')}.${ext}`;
    els.resultMeta.textContent=`${niceBytes(outBlob.size)} · ${fmt(selectedEnd()-selectedStart())}`;
    els.result.classList.remove('hidden');setProgress(100,'Finished','Your output file is ready. It has not been uploaded.');
    setStatus('Processing completed. Save the output before clearing it.','success');
    try{await ffmpeg.deleteFile('input.bin');await ffmpeg.deleteFile(`output.${ext}`);}catch{}
  }catch(e){
    setStatus(/cancel/i.test(e.message)?'Processing cancelled.':`Processing failed: ${e.message||'Unknown FFmpeg error'}. This codec or encoder may not be included in the downloaded FFmpeg build.`);
    if(ffmpeg){try{await ffmpeg.deleteFile('input.bin');}catch{}}
  }finally{
    processing=false;els.process.disabled=!sourceBlob;els.cancel.classList.add('hidden');
  }
});
els.cancel.addEventListener('click',()=>{
  if(!processing)return;
  processing=false;
  if(ffmpeg){ffmpeg.terminate();ffmpeg=null;ffmpegReady=false;}
  setProgress(0,'Cancelling…','The FFmpeg worker is being stopped.');
});
els.clearOutput.addEventListener('click',()=>{releaseOutput();els.progressArea.classList.add('hidden');setStatus('Temporary output cleared.','success');});
$('themeToggle').addEventListener('click',()=>document.body.classList.toggle('light'));

window.addEventListener('beforeunload',()=>{
  if(sourceURL)URL.revokeObjectURL(sourceURL);
  if(outputURL)URL.revokeObjectURL(outputURL);
});
setMode('video');
