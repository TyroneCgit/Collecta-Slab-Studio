(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const drawings = {
    chevron:'<path d="m6 9 6 6 6-6"/>',
    cube:'<path d="m12 2 8 4.5v10L12 21l-8-4.5v-10L12 2Z"/><path d="m4 6.5 8 4.5 8-4.5M12 11v10"/>',
    qr:'<rect x="3" y="3" width="6" height="6" rx=".7"/><rect x="15" y="3" width="6" height="6" rx=".7"/><rect x="3" y="15" width="6" height="6" rx=".7"/><path d="M13 13h3v3h-3v4h3m3-7h2v3m-3 3h3v2"/>',
    export:'<path d="M12 15V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
    upload:'<path d="M12 16V4m-4 4 4-4 4 4M5 15v4h14v-4"/>',
    card:'<rect x="5" y="2.5" width="14" height="19" rx="2.4"/><path d="M8 7h8m-8 4h8v7H8z"/>',
    plus:'<path d="M5 12h14M12 5v14"/>',minus:'<path d="M5 12h14"/>',
    orbit:'<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)"/><path d="M7 8.5C8 5 10 2.5 12 2.5c3 0 5 4.5 5 9.5s-2 9.5-5 9.5c-2 0-3.5-1.5-4.5-4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    play:'<path d="m8 4 11 8-11 8z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14m8-14v14" stroke-width="3"/>',
    sliders:'<path d="M3 6h8m4 0h6M3 12h2m4 0h12M3 18h10m4 0h4"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 5v4"/>',
    zoom:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5M7.5 10h5m-2.5-2.5v5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',reset:'<path d="M4 10a8 8 0 1 1 .2 5M4 4v6h6"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',image:'<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 6"/>'
  };
  function icon(key) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + drawings[key] + '</svg>';
  }
  all('[data-icon]').forEach(el => {el.innerHTML = icon(el.dataset.icon);});
  const poses = {angle:[-16,8,-7],front:[0,0,0],back:[180,0,0]};
  const initialScene = {pose:[...poses.angle],zoom:1,backdrop:'pearl',light:'softbox',strength:1};
  const scene = {...initialScene,pose:[...initialScene.pose]};
  const defaultFit = {inset:0,radius:2.2};
  const cardFit = {...defaultFit};
  const images = {front:null,back:null};
  const custom = {front:null,back:null,qr:null};
  let qrImage = null;
  const host = window.slabHost;
  const canvas = $('#scene'), dialog = $('#export-dialog');
  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
  const wrap = degrees => ((degrees+180)%360+360)%360-180;
  let model, labelData, sample, ready = false;
  let frontLabelKey, rearLabelSerial, rearLabelQR;
  let toastTimer, saveTimer, revision = 0, savedRevision = 0, writing = null;
  let spinFrame = 0, poseFrame = 0, lastSpinTime = 0, labelFrame = 0, dbPromise;
  let exportBusy = false, picking = false;
  function notify(message,reveal=false) {
    $('#toast-message').textContent = message; $('#reveal-export').hidden = !reveal;
    $('#toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('#toast').hidden = true;}, reveal ? 16000 : 4500);
  }
  $('#reveal-export').onclick=async()=>{
    try {await host.revealExport();$('#toast').hidden=true;}
    catch(error){notify(error.message||String(error));}
  };
  function saveStatus(message,kind='') {
    const el = $('#save-status'); el.className = 'save-state ' + kind; $('span',el).textContent = message;
  }
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve,reject) => {
      const open = indexedDB.open('slab-studio-3-local',1);
      open.onupgradeneeded = () => open.result.createObjectStore('projects');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return dbPromise;
  }
  async function browserDraft(draft) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('projects',draft ? 'readwrite' : 'readonly');
      const store = tx.objectStore('projects');
      const request = draft ? store.put(draft,'current') : store.get('current');
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (!ready || revision === savedRevision) return;
    if (writing) {await writing; return flush();}
    const target = revision;
    const draft = {version:1,label:{...labelData},scene:{...scene,pose:[...scene.pose]},cardFit:{...cardFit},images:{...custom}};
    writing = (host ? host.saveDraft(draft) : browserDraft(draft));
    try {
      await writing; savedRevision = target;
      if (revision === target) saveStatus('Saved locally');
    } catch(error) {
      saveStatus('Save failed','error'); throw error;
    } finally {writing = null;}
    if (revision !== savedRevision) await flush();
  }
  function changed() {
    if (!ready) return;
    revision++; saveStatus('Saving…','busy'); clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flush().catch(() => notify('The draft could not be saved on this device.')),550);
  }
  window.slabFlushDraft = flush;
  async function raster(url) {
    const source = new Image();
    return new Promise((resolve,reject) => {
      source.onload = () => resolve(source); source.onerror = () => reject(new Error('This image could not be decoded.'));
      source.src = url;
    });
  }
  function readDataURL(blob) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  function thumb(side) {
    const out = document.createElement('canvas');
    out.width = 112; out.height = 156;
    out.getContext('2d').drawImage(images[side],0,0,out.width,out.height);
    $('#thumb-'+side).src = out.toDataURL();
  }
  function updateLabels() {
    labelFrame = 0;
    $('#document-name').textContent = labelData.title.trim() || 'Untitled slab';
    const textures = {};
    const frontKey = JSON.stringify(labelData);
    if (frontKey !== frontLabelKey) {
      textures.label = SlabArt.label(labelData);
      frontLabelKey = frontKey;
    }
    if (labelData.serial !== rearLabelSerial || qrImage !== rearLabelQR) {
      textures.labelBack = SlabArt.label(labelData, true, qrImage);
      rearLabelSerial = labelData.serial;
      rearLabelQR = qrImage;
    }
    if (textures.label || textures.labelBack) model.setTextures(textures);
  }
  function showQR() {
    const symbol = $('#qr-symbol');
    if (qrImage) {
      const img = document.createElement('img');
      img.src = custom.qr;img.alt = '';
      symbol.replaceChildren(img);
    } else symbol.innerHTML = icon('qr');
    $('#qr-pick').textContent = qrImage ? 'Replace' : 'Add image';
    $('#qr-pick').setAttribute('aria-label',qrImage ? 'Replace rear label QR image' : 'Add rear label QR image');
    $('#qr-remove').hidden = !qrImage;
  }
  $('#qr-remove').onclick = () => {
    qrImage=null;custom.qr=null;showQR();updateLabels();orient(poses.back);changed();
  };
  function bindFieldValues() {
    all('[data-field]').forEach(el => {el.value = labelData[el.dataset.field];});
  }
  function syncCardFit() {
    model.setCardFit(cardFit.inset,cardFit.radius);
    for(const key of ['inset','radius']){
      const slider=$('#card-'+key), value=cardFit[key].toFixed(1)+' mm';
      slider.value=cardFit[key];slider.setAttribute('aria-valuetext',value);
      $('#'+key+'-value').textContent=value;
    }
    $('#reset-card-fit').disabled=cardFit.inset===defaultFit.inset && cardFit.radius===defaultFit.radius;
  }
  for(const key of ['inset','radius']){
    $('#card-'+key).oninput=event=>{
      if(!ready)return;
      cardFit[key]=event.target.valueAsNumber;
      syncCardFit();changed();
    };
  }
  $('#reset-card-fit').onclick=()=>{
    if(!ready)return;
    Object.assign(cardFit,defaultFit);syncCardFit();changed();
  };
  function importScene(value) {
    if (!value) return;
    if (Array.isArray(value.pose) && value.pose.length === 3 && value.pose.every(Number.isFinite)) scene.pose = [wrap(value.pose[0]),clamp(value.pose[1],-90,90),wrap(value.pose[2])];
    if (Number.isFinite(value.zoom)) scene.zoom = clamp(value.zoom,.55,1.65);
    if (Number.isFinite(value.strength)) scene.strength = clamp(value.strength,.45,1.55);
    if (['pearl','slate','sand'].includes(value.backdrop)) scene.backdrop = value.backdrop;
    if (['softbox','raking','daylight'].includes(value.light)) scene.light = value.light;
  }
  function syncPose() {
    model.setPose(...scene.pose);
    const current = Object.keys(poses).find(name => poses[name].every((value,i) => Math.abs(wrap(value-scene.pose[i])) < .1));
    all('[data-view]').forEach(b => {const active=b.dataset.view===current; b.classList.toggle('active',active); b.setAttribute('aria-pressed',active);});
    $('#pose-readout').textContent = current === 'front' ? 'Front view' : current === 'back' ? 'Back view' : 'Perspective';
    ['yaw','pitch','roll'].forEach((key,i) => {
      $('#'+key).value = Math.round(scene.pose[i]); $('#'+key+'-value').textContent = Math.round(scene.pose[i])+'°';
    });
    const [y,p,r] = scene.pose.map(v => v*Math.PI/180);
    const cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
    const paths = [
      [cy*cr,cy*sr,'#9d6769','X'],
      [sy*sp*cr-cp*sr,sy*sp*sr+cp*cr,'#61826b','Y'],
      [sy*cp*cr+sp*sr,sy*cp*sr-sp*cr,'#776a9c','Z']
    ];
    $('#axis').innerHTML = paths.map(([x,up,color,letter])=>'<g fill="'+color+'"><path d="M31 32l'+x*18+' '+(-up*18)+'" stroke="'+color+'" stroke-width="1.5"/><text x="'+(31+x*24)+'" y="'+(35-up*24)+'" text-anchor="middle" font-size="9" font-family="monospace">'+letter+'</text></g>').join('')+'<circle cx="31" cy="32" r="2" fill="#6c6775"/>';
  }
  function zoom(value,mark=true) {
    scene.zoom = clamp(value,.55,1.65); model.setZoom(scene.zoom); $('#zoom-value').textContent = Math.round(scene.zoom*100)+'%';
    $('#zoom-in').disabled = scene.zoom >= 1.649; $('#zoom-out').disabled = scene.zoom <= .551; if(mark) changed();
  }
  function syncLighting() {
    model.setLight(scene.light,scene.strength); model.setBackdrop(scene.backdrop);
    $('#strength').value = Math.round(scene.strength*100); $('#light-value').textContent = Math.round(scene.strength*100)+'%';
    for(const attr of ['light','backdrop']) all('[data-'+attr+']').forEach(b => {const selected=b.dataset[attr]===scene[attr]; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',selected);});
    $('#stage').classList.toggle('dark-stage',scene.backdrop==='slate');
  }
  function stopMotion() {
    cancelAnimationFrame(poseFrame); poseFrame=0;
    if (!spinFrame) return;
    cancelAnimationFrame(spinFrame); spinFrame=0; lastSpinTime=0;
    $('#spin').setAttribute('aria-pressed','false'); $('#spin').setAttribute('aria-label','Start turntable'); $('#spin').title='Start turntable'; $('#spin').innerHTML=icon('play'); changed();
  }
  function orient(target) {
    if (!ready) return;
    stopMotion();
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) {scene.pose=[...target];syncPose();changed();return;}
    const start=performance.now(),from=[...scene.pose],diff=target.map((v,i)=>wrap(v-from[i]));
    function step(now) {
      const t=clamp((now-start)/300,0,1),e=1-(1-t)**3;
      scene.pose=t===1?[...target]:from.map((v,i)=>wrap(v+diff[i]*e));syncPose();
      if(t<1) poseFrame=requestAnimationFrame(step); else {poseFrame=0;changed();}
    }
    poseFrame=requestAnimationFrame(step);
  }
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!ready || e.button!==0 || pointer) return;
    stopMotion();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointer || pointer.id!==e.pointerId) return;
    scene.pose[0]=wrap(scene.pose[0]+(e.clientX-pointer.x)*.42);scene.pose[1]=clamp(scene.pose[1]+(e.clientY-pointer.y)*.3,-90,90);
    pointer.x=e.clientX;pointer.y=e.clientY;syncPose();
  });
  function finishDrag(e){if(pointer?.id===e.pointerId){pointer=null;canvas.classList.remove('dragging');changed();}}
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,finishDrag));
  canvas.addEventListener('wheel',e=>{if(!ready)return;e.preventDefault();zoom(scene.zoom*Math.exp(-clamp(e.deltaY,-120,120)*.002));},{passive:false});
  all('[data-view]').forEach(b=>b.onclick=()=>orient(poses[b.dataset.view]));
  $('#zoom-in').onclick=()=>ready&&zoom(scene.zoom+.1);$('#zoom-out').onclick=()=>ready&&zoom(scene.zoom-.1);$('#zoom-reset').onclick=()=>ready&&zoom(1);
  $('#spin').onclick=()=>{
    if(!ready)return;
    if(spinFrame){stopMotion();return;}
    stopMotion(); $('#spin').setAttribute('aria-pressed','true');$('#spin').setAttribute('aria-label','Pause turntable');$('#spin').title='Pause turntable';$('#spin').innerHTML=icon('pause');
    function step(now){if(lastSpinTime)scene.pose[0]=wrap(scene.pose[0]+Math.min(100,now-lastSpinTime)*.026);lastSpinTime=now;syncPose();spinFrame=requestAnimationFrame(step);}
    spinFrame=requestAnimationFrame(step);
  };
  for(const tab of ['card','scene']) $('#tab-'+tab).onclick=()=>{
    for(const key of ['card','scene']) {const active=key===tab;$('#tab-'+key).classList.toggle('selected',active);$('#tab-'+key).setAttribute('aria-pressed',active);$('#panel-'+key).hidden=!active;}
    $('.panel-scroll').scrollTop=0;
  };
  all('[data-field]').forEach(el=>el.addEventListener('input',()=>{
    if(!ready)return;labelData[el.dataset.field]=el.value;
    if(!labelFrame)labelFrame=requestAnimationFrame(updateLabels);changed();
  }));
  for(const attr of ['light','backdrop']) all('[data-'+attr+']').forEach(b=>b.onclick=()=>{if(ready){scene[attr]=b.dataset[attr];syncLighting();changed();}});
  $('#strength').oninput=e=>{if(ready){scene.strength=e.target.valueAsNumber/100;syncLighting();changed();}};
  ['yaw','pitch','roll'].forEach((key,i)=>$('#'+key).oninput=e=>{if(!ready)return;stopMotion();scene.pose[i]=e.target.valueAsNumber;syncPose();changed();});
  $('#reset-scene').onclick=()=>{if(!ready)return;stopMotion();Object.assign(scene,initialScene,{pose:[...poses.angle]});syncLighting();syncPose();zoom(1);};
  document.addEventListener('keydown',e=>{
    if(!ready || e.metaKey || e.ctrlKey || e.altKey || dialog.open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    const key=e.key;
    if(['1','2','3'].includes(key)){e.preventDefault();orient(poses[['front','angle','back'][Number(key)-1]]);}
    if(['+','=','-'].includes(key)){e.preventDefault();zoom(scene.zoom+(key==='-'?-.1:.1));}
    if(e.target!==canvas || !key.startsWith('Arrow'))return;
    e.preventDefault();stopMotion();const distance=e.shiftKey?15:5;
    if(key==='ArrowLeft'||key==='ArrowRight')scene.pose[0]=wrap(scene.pose[0]+(key==='ArrowLeft'?-distance:distance));
    else scene.pose[1]=clamp(scene.pose[1]+(key==='ArrowUp'?-distance:distance),-90,90);
    syncPose();changed();
  });
  async function applySide(side,url) {
    const original=await raster(url);
    if (side==='qr') {
      const ratio=Math.min(1,1024/Math.max(original.naturalWidth,original.naturalHeight));
      const code=document.createElement('canvas');
      code.width=Math.max(1,Math.round(original.naturalWidth*ratio));code.height=Math.max(1,Math.round(original.naturalHeight*ratio));
      const ctx=code.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,code.width,code.height);
      ctx.imageSmoothingEnabled=false;ctx.drawImage(original,0,0,code.width,code.height);
      qrImage=code;custom.qr=code.toDataURL('image/png');showQR();updateLabels();orient(poses.back);changed();
      return;
    }
    const target=document.createElement('canvas');
    // A standard card is 2.5 by 3.5 inches. Retain source detail up to the native picker's 3K limit.
    const unit=Math.min(438,Math.ceil(Math.max(original.naturalWidth/5,original.naturalHeight/7)));
    target.width=5*unit;target.height=7*unit;
    const ctx=target.getContext('2d');ctx.fillStyle='#f7f6f3';ctx.fillRect(0,0,target.width,target.height);
    const scale=Math.min(target.width/original.naturalWidth,target.height/original.naturalHeight);
    const w=original.naturalWidth*scale,h=original.naturalHeight*scale;
    ctx.imageSmoothingQuality='high';ctx.drawImage(original,(target.width-w)/2,(target.height-h)/2,w,h);
    const encoded=target.toDataURL('image/png');
    model.setTextures({[side]:target});images[side]=target;custom[side]=encoded;thumb(side);changed();
  }
  async function acceptFile(side,file) {
    if(!file)return;
    if(file.size>96*1024*1024)throw new Error('Choose an image smaller than 96 MB.');
    if(!/^image\/(png|jpeg|webp|avif|gif)$/.test(file.type))throw new Error('Choose a PNG, JPEG, WebP, AVIF, or GIF image.');
    await applySide(side,await readDataURL(file));
  }
  const picker=$('#image-picker');
  picker.onchange=async()=>{const file=picker.files[0],side=picker.dataset.side;picker.value='';try{await acceptFile(side,file);}catch(e){notify(e.message);}};
  all('[data-side]').forEach(tile=>{
    const side=tile.dataset.side;
    tile.onclick=async()=>{
      if(!ready || picking)return;
      if(!host){picker.dataset.side=side;picker.click();return;}
      picking=true;
      try{const result=await host.pickImage(side);if(result)await applySide(side,result.dataURL);}
      catch(e){notify(e.message||String(e));}finally{picking=false;}
    };
    tile.ondragover=e=>{e.preventDefault();tile.classList.add('over');};tile.ondragleave=()=>tile.classList.remove('over');
    tile.ondrop=async e=>{e.preventDefault();tile.classList.remove('over');if(!ready || picking)return;picking=true;try{await acceptFile(side,e.dataTransfer.files[0]);}catch(error){notify(error.message);}finally{picking=false;}};
  });
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
  const getFormat=()=>$('input[name="format"]:checked').value;
  function syncFormat() {
    const format=getFormat();
    $('#glb-description').hidden=format!=='glb';$('#usdz-description').hidden=format!=='usdz';$('#png-options').hidden=format!=='png';
    $('#format-note').textContent={glb:'Binary glTF',png:'Portrait image',usdz:'Apple 3D model'}[format];
    $('#save-caption').textContent='Save '+format.toUpperCase()+'…';
    $('#export-error').hidden=true;
  }
  all('input[name="format"]').forEach(el=>el.onchange=syncFormat);
  window.slabOpenExport=()=>{if(ready&&!exportBusy&&!dialog.open){stopMotion();syncFormat();dialog.showModal();}};
  $('#export-xcode').onclick=()=>saveExport('usdz');
  $('#export-open').onclick=window.slabOpenExport;$('#export-close').onclick=()=>{if(!exportBusy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(exportBusy)e.preventDefault();});
  $('#export-form').onsubmit=e=>{e.preventDefault();saveExport(getFormat());};
  async function saveExport(format){
    if(exportBusy || !ready)return;
    exportBusy=true;stopMotion();$('#export-error').hidden=true;$('#toast').hidden=true;
    const caption=dialog.open?$('#save-caption'):$('#xcode-caption');
    const width=Number($('#resolution').value);
    const controls=[$('#export-xcode'),$('#export-open'),...all('button,input,select',dialog)];
    controls.forEach(el=>el.disabled=true);caption.textContent='Preparing…';
    const stem=(labelData.title.trim()||'Card').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,80);
    const name=stem+' - Slab.'+format;
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(labelFrame){cancelAnimationFrame(labelFrame);updateLabels();}
      let blob;
      if(format==='png'){
        blob=await model.exportPNG({width,height:width*1.25,transparent:$('#transparent').checked,
          onProgress:fraction=>{caption.textContent='Rendering '+Math.round(fraction*100)+'%';}});
      }else{
        blob=await model.exportGLB();
        if(format==='usdz')blob=await SlabUSDZ.fromGLB(blob);
      }
      if(!blob || !blob.size)throw new Error('The renderer returned an empty file.');
      let saved=true;
      if(host) {
        caption.textContent='Saving…';
        saved=await host.saveAsset(await readDataURL(blob),name);
      }
      else {const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
      if(saved){
        if(dialog.open)dialog.close();
        const message=format==='usdz'?'Drag the saved USDZ into your Xcode project.':format.toUpperCase()+' exported.';
        notify(message,typeof host?.revealExport==='function');
      }
    }catch(error){
      const message=error.message||String(error);
      if(dialog.open){$('#export-error').textContent=message;$('#export-error').hidden=false;}
      else notify(message);
    }finally{
      exportBusy=false;controls.forEach(el=>el.disabled=false);
      $('#xcode-caption').textContent='Export for Xcode';$('#save-caption').textContent='Save '+getFormat().toUpperCase()+'…';
    }
  }
  function showError(message){$('#stage-message').textContent=message;$('#stage-message').hidden=false;}
  async function init(){
    model=new SlabRenderer(canvas);
    sample=await SlabArt.sample();labelData={...SlabArt.defaults};Object.assign(images,sample);
    let restoreWarning='';
    try{
      const draft=await (host?host.loadDraft():browserDraft());
      if(draft?.version===1){
        for(const key of Object.keys(labelData))if(typeof draft.label?.[key]==='string')labelData[key]=draft.label[key].slice(0,100);
        if (typeof draft.label?.cardNumber!=='string') labelData.cardNumber='';
        importScene(draft.scene);
        for(const key of ['inset','radius']){
          const saved=draft.cardFit?.[key],slider=$('#card-'+key);
          if(Number.isFinite(saved))cardFit[key]=clamp(Math.round(saved*10)/10,+slider.min,+slider.max);
        }
        for(const side of ['front','back']){
          const url=draft.images?.[side];if(typeof url==='string' && url.startsWith('data:image/png;base64,')){
            try{images[side]=await raster(url);custom[side]=url;}catch{restoreWarning='An artwork image could not be restored.';}
          }
        }
        if (typeof draft.images?.qr==='string' && draft.images.qr.startsWith('data:image/png;base64,')) {
          try {qrImage=await raster(draft.images.qr);custom.qr=draft.images.qr;}
          catch {restoreWarning='The rear label QR image could not be restored.';}
        }
      }
      saveStatus(draft?'Saved locally':'Local workspace');
    }catch{restoreWarning='The previous draft could not be opened.';}
    bindFieldValues();model.setTextures(images);thumb('front');thumb('back');showQR();updateLabels();
    syncCardFit();syncPose();syncLighting();zoom(scene.zoom,false);model.render();$('#stage-message').hidden=true;
    ready=true;$('#export-xcode').disabled=false;$('#export-open').disabled=false;if(restoreWarning)notify(restoreWarning);
  }
  init().catch(error=>{saveStatus('Preview unavailable','error');showError('The 3D preview could not start. '+(error.message||String(error)));});
})();
