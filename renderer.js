/* Local GPU renderer. Geometry and optical dimensions are expressed in millimetres. */
(() => {
  'use strict';

  const size = { w: 80.26, h: 135.13, d: 6.86 };
  const card = { x: 0, y: -13.7, w: 63.5, h: 88.9, r: 2.2, horizontalRail: 27.5, verticalRail: 35.5 };
  const label = { x: 0, y: 52, w: 68.6, h: 20.4, r: 0.4 };
  const textureKeys = ['front', 'back', 'label', 'labelBack'];
  const palettes = {
    pearl: [[0.936, 0.933, 0.952], [0.785, 0.781, 0.827]],
    slate: [[0.31, 0.333, 0.38], [0.146, 0.158, 0.192]],
    sand: [[0.95, 0.925, 0.88], [0.805, 0.768, 0.708]]
  };
  const lightIds = { softbox: 0, raking: 1, daylight: 2 };
  const screenVertex = `
    attribute vec2 aPosition;
    void main() { gl_Position=vec4(aPosition,0.,1.); }
  `;
  const glassVertex = `
    precision highp float;
    attribute vec3 aPosition, aNormal;
    uniform mat3 uRotation;
    uniform vec2 uFull, uTarget, uOrigin;
    uniform float uScale;
    varying highp vec3 vPoint, vNormal;
    void main(){
      vPoint=aPosition; vNormal=aNormal;
      vec3 p=uRotation*aPosition;
      float w=1.-p.z/520.;
      vec2 pixel=(uFull*.5+vec2(0.,1.50*uScale)-uOrigin)*w+p.xy*uScale;
      gl_Position=vec4(2.*pixel/uTarget-w,-p.z/100.,w);
    }
  `;
  const stageSource = `
    uniform vec2 uFull, uOrigin;
    uniform float uScale, uFloor, uContactX, uContactSpan, uClear;
    uniform vec3 uPale, uDeep;
    vec3 toLinear(vec3 c){return pow(max(c,vec3(0.)),vec3(2.2));}
    vec3 toDisplay(vec3 c){return pow(max(c,vec3(0.)),vec3(1./2.2));}
    vec2 screenPoint(){return (gl_FragCoord.xy+uOrigin-.5*uFull)/uScale;}
    vec3 stage(vec2 xy){
      vec2 uv=xy*uScale/uFull+.5;
      vec2 k=(uv-vec2(.35,.73))*vec2(1.95,1.7);
      float ramp=clamp(.18+.40*(1.-uv.y)+.41*uv.x-.21*exp(-dot(k,k)),0.,1.);
      vec3 base=mix(uPale,uDeep,ramp);
      float fy=xy.y-uFloor;
      vec2 near=vec2((xy.x-uContactX)/uContactSpan,(fy+.34)/1.17);
      vec2 castShadow=vec2((xy.x-uContactX*.52)/37.,(fy+1.42)/3.77);
      vec2 soft=vec2((xy.x-uContactX*.28)/51.,(fy+2.05)/7.1);
      float occlusion=.16*exp(-dot(near,near))+.14*exp(-dot(castShadow,castShadow))+.068*exp(-dot(soft,soft));
      return toLinear(base*(1.-occlusion));
    }
  `;
  const stageFragment = `precision highp float; ${stageSource}
    void main(){gl_FragColor=uClear>.5?vec4(0.):vec4(toDisplay(stage(screenPoint())),1.);}
  `;
  const glassFragment = `
    precision highp float;
    precision highp sampler2D;
    varying highp vec3 vPoint,vNormal;
    uniform mat3 uRotation;
    uniform float uLight,uStrength;
    uniform vec3 uCardShape;
    uniform vec2 uCardRails;
    uniform sampler2D uFront,uBack,uLabel,uLabelBack;
    ${stageSource}
    const float eta=1.49;
    const vec2 shell=vec2(40.13,67.565), cardSize=vec2(31.75,44.45), labelSize=vec2(34.3,10.2);
    const vec2 cardCenter=vec2(0.,-13.7), labelCenter=vec2(0.,52.);
    float clamp01(float n){return clamp(n,0.,1.);}
    vec2 safeNorm(vec2 p){return p*inversesqrt(max(dot(p,p),.00000000001));}
    // Distance and analytic outward normal of an XY rounded-rectangle molding.
    vec3 rounded(vec2 p,vec2 halfSize,float radius){
      vec2 q=abs(p)-halfSize+radius, pos=max(q,0.);
      float d=length(pos);
      vec2 grad=d>.00001 ? pos/d : (q.x>q.y?vec2(1.,0.):vec2(0.,1.));
      return vec3(grad*sign(p),d+min(max(q.x,q.y),0.)-radius);
    }
    float boxDist(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
    float fresnel(float c){
      c=clamp01(c);
      float t=sqrt(1.-(1.-c*c)/(eta*eta));
      vec2 rs=vec2(c-eta*t,eta*c-t)/vec2(c+eta*t,eta*c+t);
      return .5*dot(rs,rs);
    }
    float bank(vec3 dir,vec3 axis,vec2 halfSize,float softness){
      vec3 n=normalize(axis),x=normalize(cross(vec3(0.,1.,0.),n)),y=cross(n,x);
      float f=dot(dir,n);
      vec2 uv=vec2(dot(dir,x),dot(dir,y))/max(.10,f);
      float d=boxDist(uv,halfSize,min(.15,.7*halfSize.x));
      return (1.-smoothstep(-softness,softness,d))*smoothstep(.01,.19,f);
    }
    vec3 room(vec3 d,float rough){
      vec3 ambient=mix(vec3(.095,.091,.109),vec3(.46,.48,.55),clamp01(.5+.48*d.y));
      vec3 mainAxis=vec3(-1.29,.38,.83);
      vec2 mainSize=vec2(.23,1.13);
      float power=2.52,blur=.13;
      if(uLight>.5&&uLight<1.5){mainAxis=vec3(-1.33,.43,.26);mainSize=vec2(.19,.87);power=3.22;blur=.10;}
      if(uLight>1.5){mainAxis=vec3(-.83,1.25,.91);mainSize=vec2(.76,.66);power=2.27;blur=.25;}
      float flag=bank(d,vec3(-.33,.10,.92),vec2(.36,1.1),.22+rough);
      float rightFlag=bank(d,vec3(.59,-.11,.79),vec2(.25,1.13),.16+rough);
      ambient*=1.-.87*flag;
      ambient*=1.-.74*rightFlag;
      float key=bank(d,mainAxis,mainSize,blur+rough);
      float rim=bank(d,vec3(.97,.09,.27),vec2(.19,1.04),.11+rough);
      float top=bank(d,vec3(.07,.93,-.32),vec2(.94,.23),.14+rough);
      float ceiling=bank(d,vec3(-.21,1.15,.78),vec2(.99,.26),.14+rough);
      float back=bank(d,vec3(-.51,-.13,-.91),vec2(.35,.89),.22+rough);
      return (ambient+power*key*vec3(1.,.985,.965)+1.87*rim*vec3(.92,.965,1.)+
        1.31*top+1.48*ceiling+.39*back)*(.39+.63*uStrength);
    }
    // Closed opposite wall. Broad planes return exact intersections; the few
    // corner rays use a bracketed, monotonic root on a convex rounded cap.
    vec4 body(vec3 p) {
      vec3 rect=rounded(p.xy,shell,3.7);
      vec2 q=vec2(rect.z+.88,abs(p.z)-2.26);
      vec2 g=(max(q.x,q.y)>0.)?safeNorm(max(q,0.)):(q.x>q.y?vec2(1.,0.):vec2(0.,1.));
      float dist=length(max(q,0.))+min(max(q.x,q.y),0.)-.88;
      return vec4(rect.xy*g.x,sign(p.z)*g.y,dist);
    }
    float farWall(vec3 p,vec3 ray,out vec3 n){
      vec3 signs=step(vec3(0.),ray)*2.-1.;
      vec3 ts=(vec3(shell,3.14)-p*signs)/max(abs(ray),vec3(.000001));
      float hi=max(.018,min(ts.x,min(ts.y,ts.z)));
      vec3 q=p+hi*ray;
      if(ts.z<=min(ts.x,ts.y) && boxDist(q.xy,shell-vec2(.88),2.82)<-.005){
        n=vec3(0.,0.,signs.z);return hi;
      }
      if(abs(q.z)<2.26 && (abs(q.x)<shell.x-3.7 || abs(q.y)<shell.y-3.7)){
        n=(ts.x<ts.y)?vec3(signs.x,0.,0.):vec3(0.,signs.y,0.);return hi;
      }
      float lo=0.;
      for(int i=0;i<14;i++){float a=.5*(lo+hi);if(body(p+a*ray).w>0.)hi=a;else lo=a;}
      n=body(p+ray*hi).xyz;
      return hi;
    }
    vec2 derivativeAtPlane(vec3 incident,vec3 stepWorld, float perspective) {
      vec3 s=stepWorld*uRotation;
      float z=sign(incident.z+.0000001)*max(abs(incident.z),.011);
      return (s.xy-s.z*incident.xy/z)*perspective/uScale;
    }
    vec4 printSample(sampler2D ink,vec2 uv,vec2 dx,vec2 dy){
      #ifdef HAS_TEXTURE_GRAD
        return texture2DGradEXT(ink,uv,dx,dy);
      #else
        return texture2D(ink,uv);
      #endif
    }
    float widthOnNormal(vec2 n,vec2 dx,vec2 dy){return max(.0006,abs(dot(dx,n))+abs(dot(dy,n)));}
    // Convolve the cross-section with the local pixel footprint before evaluating
    // the slope. Long nearly tangential highlights retain a finite optical width.
    vec2 bead(vec3 d,float sigma,float h,vec2 dx,vec2 dy){
      float fp=widthOnNormal(d.xy,dx,dy),v=sigma*sigma+fp*fp/12.;
      return d.xy*(-d.z/v)*h*sigma*inversesqrt(v)*exp(-.5*d.z*d.z/v);
    }
    vec2 shoulder(vec3 d,float sigma,float h,vec2 dx,vec2 dy){
      float fp=widthOnNormal(d.xy,dx,dy),v=sigma*sigma+fp*fp/12.;
      return d.xy*h*inversesqrt(v)*exp(-.5*d.z*d.z/v)*.399;
    }
    vec2 retainingGradient(vec2 p,vec2 dx,vec2 dy){
      vec3 weld=rounded(p,shell-vec2(2.95),1.94);
      vec3 cavity=rounded(p-vec2(0.,-14.95),vec2(36.52,49.25),1.64);
      vec3 cardWell=rounded(p-cardCenter,uCardShape.xy+vec2(1.05),max(0.,uCardShape.z-.1));
      vec3 labelWell=rounded(p-labelCenter,labelSize+vec2(1.01),1.24);
      vec3 crossbar=rounded(p-vec2(0.,37.63),vec2(36.67,.67),.56);
      vec2 cp=p-cardCenter;
      vec3 horizontal=rounded(vec2(cp.x,abs(cp.y)-uCardShape.y-1.79),vec2(uCardRails.x,.43),.42);
      horizontal.y*=sign(cp.y);
      vec3 vertical=rounded(vec2(abs(cp.x)-uCardShape.x-1.53,cp.y),vec2(.41,uCardRails.y),.40);
      vertical.x*=sign(cp.x);
      return bead(weld,.49,.41,dx,dy)+shoulder(cavity,.49,.51,dx,dy)+
        shoulder(cardWell,.46,.72,dx,dy)+shoulder(labelWell,.49,.70,dx,dy)+
        shoulder(crossbar,.39,.64,dx,dy)+shoulder(horizontal,.36,.50,dx,dy)+shoulder(vertical,.34,.46,dx,dy);
    }
    vec3 mold(vec3 base,vec3 p,vec3 ray,float maxT,float face,vec2 dx,vec2 dy,float weight){
      float t=(face*1.48-p.z)/(sign(ray.z+.0000001)*max(abs(ray.z),.00001));
      if(t<=0. || t>=maxT) return base;
      vec2 xy=p.xy+ray.xy*t;
      float boundary=boxDist(xy,shell,3.7), cw=boxDist(xy-cardCenter,uCardShape.xy,max(0.,uCardShape.z-.04)), lw=boxDist(xy-labelCenter,labelSize,.42);
      if(boundary>-.78||min(cw,lw)<-.78)return base;
      vec2 slope=retainingGradient(xy,dx,dy);
      vec3 n=normalize(vec3(-slope,face));
      if(dot(n,ray)>0.)n=-n;
      float bend=length(slope), flange=smoothstep(-.56,1.05,min(cw,lw));
      // A low, smoothly varying diffuser in the sealing flange. The clear
      // optical window has no synthetic high-frequency grain or engraved lines.
      float frost=flange*(.068+.005*cos(.48*xy.x+.21*xy.y)*cos(.19*xy.y));
      vec3 haze=toLinear(mix(uPale,vec3(.918,.924,.941),.77));
      vec3 traced=mix(base,haze,frost);
      float bounce=bend/(.47+bend);
      float lobe=.17+.40*(1.-smoothstep(.64,.95,abs(dot(ray,n))));
      vec3 refl=room(uRotation*reflect(ray,n),.13);
      refl/=1.+.27*refl;
      traced=mix(traced,refl,lobe*bounce);
      // Internal die shoulders refract a narrow edge of the graded light bank.
      // Its width follows the molded radius rather than a fixed screen-space line.
      vec2 lamp=uLight<.5?vec2(-.58,.82):(uLight<1.5?vec2(-.88,.48):vec2(-.40,.92));
      vec2 offset=(uRotation*vec3(-slope*face,0.)).xy;
      float focus=dot(offset,lamp);
      // Each curved land images a strip bank on one side and its adjacent
      // dark flag on the other. A broad angular transition avoids glint chatter.
      float bankMix=smoothstep(-.32,.34,focus+.042*sin(xy.y*.038+xy.x*.024));
      vec3 toolLight=mix(vec3(.020,.024,.032),vec3(.96,.975,1.),bankMix);
      float exposure=.37*smoothstep(.015,.61,bend)*(.68+.32*clamp01(uStrength));
      traced=mix(traced,toolLight,exposure);
      traced=traced*(1.-.052*bounce)+(.037*max(focus,0.))*bounce;
      return mix(base,traced,weight);
    }
    vec4 printAt(vec3 hit,vec3 inner,float exitT,vec3 incident,vec2 dx,vec2 dy){
      float side=inner.z<0.?1.:-1.;
      vec3 p=hit,ray=inner;
      float remaining=exitT;
      float gapT=(side*1.46-p.z)/(sign(ray.z+.0000001)*max(abs(ray.z),.00001));
      if(gapT>0. && gapT<exitT){
        vec3 next=refract(inner,vec3(0.,0.,side),eta);
        if(dot(next,next)<.001)return vec4(0.);
        p+=inner*gapT;ray=next;
        // The two optical windows enclose a true air gap around the paper.
        remaining=2.97/max(abs(ray.z),.008);
      }
      float t=(side*.2-p.z)/(sign(ray.z+.0000001)*max(abs(ray.z),.00001));
      vec2 xy=p.xy+ray.xy*t;
      vec3 dc=rounded(xy-cardCenter,uCardShape.xy,uCardShape.z),dl=rounded(xy-labelCenter,labelSize,.42);
      bool isCard=dc.z<dl.z;
      vec3 edge=isCard?dc:dl;
      vec2 halfSize=isCard?uCardShape.xy:labelSize;
      vec2 center=isCard?cardCenter:labelCenter;
      float aa=.5*widthOnNormal(edge.xy,dx,dy);
      float cover=1.-smoothstep(-aa,aa,edge.z);
      vec2 dBack=xy+ray.xy*.40/max(abs(ray.z),.008);
      float paperSide=(1.-smoothstep(-aa,aa,boxDist(dBack-center,halfSize,isCard?uCardShape.z:.42)))*(1.-cover);
      float valid=step(.0,t)*step(t,remaining);
      vec2 orientation=vec2(side,1.)*.5/(isCard?cardSize:labelSize);
      vec2 uv=clamp((xy-center)*orientation+.5,.00002,.99998);
      vec2 gx=dx*orientation,gy=dy*orientation;
      vec4 texel;
      if(isCard)texel=side>0.?printSample(uFront,uv,gx,gy):printSample(uBack,uv,gx,gy);
      else texel=side>0.?printSample(uLabel,uv,gx,gy):printSample(uLabelBack,uv,gx,gy);
      vec3 pigment=mix(vec3(.92),toLinear(texel.rgb),texel.a);
      if(!isCard){
        vec2 mid=side>0.?vec2(.50260,.14732):vec2(.5,.76);
        float foil=1.-smoothstep(-.001,.001,boxDist(uv-mid,vec2(.06641,.14732),.00001));
        if(side<0.)foil=(1.-smoothstep(-.001,.001,abs(uv.x-.5)-.10026*clamp01((uv.y-.41741)/.11384)))*smoothstep(.41741,.419,uv.y);
        float glint=pow(.5+.5*cos(10.*(uv.x-mid.x)+8.*ray.x+3.6*ray.y+1.2),3.);
        vec3 spectral=.5+.5*cos(vec3(.18,2.1,4.3)+9.*ray.x+7.*uv.x+3.*uv.y);
        pigment+=foil*glint*smoothstep(.10,.55,max(pigment.r,max(pigment.g,pigment.b)))*(.12+.16*spectral)*uStrength;
      }
      float a=(cover+paperSide)*valid;
      return vec4((pigment*cover+vec3(.64,.615,.60)*paperSide)*valid,a);
    }
    void main(){
      vec3 p=vPoint,n=normalize(vNormal),camera=vec3(0.,0.,520.)*uRotation;
      vec3 incident=normalize(p-camera),inner=refract(incident,n,1./eta);
      vec3 origin=p+inner*.025,en;
      float exitT=farWall(origin,inner,en);
      vec3 exitDir=refract(inner,-en,eta),reflected=reflect(inner,-en);
      float rear=dot(exitDir,exitDir)<.001?1.:fresnel(abs(dot(exitDir,en)));
      vec3 worldI=uRotation*incident;
      vec2 xy=screenPoint(),shift=((uRotation*exitDir).xy-worldI.xy)*18.;
      vec3 transmitted=stage(xy+shift),col=mix(transmitted,room(uRotation*reflected,.056),rear);
      float perspective=1.-(uRotation*p).z/520.;
      vec2 dx=derivativeAtPlane(incident,vec3(1.,0.,0.),perspective);
      vec2 dy=derivativeAtPlane(incident,vec3(0.,1.,0.),perspective);
      float side=inner.z<0.?1.:-1.;
      vec4 paper=printAt(origin,inner,exitT,incident,dx,dy);
      col=mold(col,origin,inner,exitT,-side,dx,dy,.31*(1.-paper.a));
      col=paper.rgb+(1.-paper.a)*col;
      col=mold(col,origin,inner,exitT,side,dx,dy,1.);
      col*=exp(-min(exitT,50.)*vec3(.00128,.00101,.00067)*(1.-.85*paper.a));
      float front=fresnel(abs(dot(n,-incident)));
      vec3 spec=room(uRotation*reflect(incident,n),.046);
      col=mix(col,spec,front);
      vec3 rgb=clamp(toDisplay(col),0.,1.);
      if(uClear>.5){
        vec3 bg=toDisplay(transmitted);
        float alpha=clamp01(max(paper.a,.092+.45*rear+.78*front+.18*(1.-abs(n.z))));
        vec3 low=(bg-rgb)/max(bg,vec3(.0001)),high=(rgb-bg)/max(1.-bg,vec3(.0001));
        vec3 a=max(low,high);alpha=max(alpha,max(a.x,max(a.y,a.z)));
        // Premultiplied linear coverage in display coordinates is resolved
        // before unmatting, preserving antialiased silhouettes on a new ground.
        gl_FragColor=vec4(clamp(rgb-bg*(1.-alpha),0.,alpha),alpha);
      }else gl_FragColor=vec4(rgb,1.);
    }
  `;

  const resolveVertex=`
    attribute vec2 aPosition;
    varying highp vec2 uv;
    void main(){uv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}
  `;
  function resolveFragment(samples){
    return `precision highp float;
      varying highp vec2 uv;
      uniform sampler2D uImage;
      uniform vec2 uTexel,uExtent;
      void main(){
        vec4 sum=vec4(0.);
        for(int y=0;y<${samples};y++)for(int x=0;x<${samples};x++){
          vec2 p=(vec2(float(x),float(y))-vec2(${(samples-1).toFixed(1)}*.5))*uTexel;
          sum+=texture2D(uImage,uv*uExtent+p);
        }
        gl_FragColor=sum/${(samples*samples).toFixed(1)};
      }`;
  }

  function program(gl, isWebGL2, vertex, fragment, gradientExtension=false) {
    function compile(kind, text) {
      const vert=kind===gl.VERTEX_SHADER;
      if(isWebGL2){
        text=text.replace(/\battribute\b/g,'in').replace(/\bvarying\b/g,vert?'out':'in')
          .replace(/texture2DGradEXT/g,'textureGrad').replace(/\btexture2D\b/g,'texture')
          .replace(/\bgl_FragColor\b/g,'outputColor');
        text='#version 300 es\n'+(vert?'':'#define HAS_TEXTURE_GRAD\nout highp vec4 outputColor;\n')+text;
      }else if(!vert&&gradientExtension){
        text='#extension GL_EXT_shader_texture_lod : enable\n#define HAS_TEXTURE_GRAD\n'+text;
      }
      const shader=gl.createShader(kind);
      gl.shaderSource(shader,text);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);
        throw new Error('The holder shader failed to compile. '+error);
      }
      return shader;
    }
    const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment);
    const handle=gl.createProgram();
    gl.attachShader(handle,v);gl.attachShader(handle,f);
    gl.bindAttribLocation(handle,0,'aPosition');gl.bindAttribLocation(handle,1,'aNormal');gl.linkProgram(handle);
    gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(handle,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(handle));
    const uniform={};
    for(let i=0;i<gl.getProgramParameter(handle,gl.ACTIVE_UNIFORMS);i++){
      const name=gl.getActiveUniform(handle,i).name;
      uniform[name.slice(1)]=gl.getUniformLocation(handle,name);
    }
    return {handle,uniform};
  }

  function shellGeometry(part='both') {
    const w=40.13,h=67.565,corner=3.7,b=.88;
    let rings=[];
    function lip(side){
      const center=side>0?1.67:2.22,halfWidth=side>0?.72:.69;
      const range=3.35-b;
      for(let j=0;j<=36;j++){
        const i=b+range*(side>0?j:36-j)/36;
        const t=(i-center)/halfWidth;
        const l=Math.abs(t)<1?.5+.5*Math.cos(Math.PI*t):0;
        const slope=Math.abs(t)<1?-.29*.5*Math.PI*Math.sin(Math.PI*t)/halfWidth:0;
        rings.push([i,side*(3.14+.29*l),slope,side]);
      }
    }
    function shoulder(side){
      for(let j=0;j<=16;j++){
        const angle=(side>0?j:16-j)*Math.PI/32;
        rings.push([b*(1-Math.cos(angle)),side*(2.26+b*Math.sin(angle)),Math.cos(angle),side*Math.sin(angle)]);
      }
    }
    lip(-1);shoulder(-1);
    for(let j=1;j<48;j++){
      const z=-2.26+j*(1.39/48);
      const t=(z+1.75)/.21;
      const inset=Math.abs(t)<1?.079*(1+Math.cos(Math.PI*t)):0;
      const slope=Math.abs(t)<1?-.079*Math.PI*Math.sin(Math.PI*t)/.21:0;
      rings.push([inset,z,1,slope]);
    }
    const seam=-1.75;
    const seamRing=[.158,seam,1,0];
    const seamIndex=rings.findIndex(r=>r[1]>seam);
    rings.splice(seamIndex,0,seamRing);
    shoulder(1);lip(1);
    if(part==='front')rings=rings.filter(r=>r[1]>=seam);
    if(part==='rear')rings=rings.filter(r=>r[1]<=seam);
    rings=rings.filter((r,i)=>i===0||Math.abs(r[0]-rings[i-1][0])+Math.abs(r[1]-rings[i-1][1])>1e-8);
    const positions=[],normals=[],indices=[];
    function vertex(x,y,z,nx,ny,nz){positions.push(x,y,z);normals.push(nx,ny,nz);}
    const steps=30;
    const counts=4*(steps+1);
    for(const [inset,z,radial,vertical] of rings){
      const n=Math.hypot(radial,vertical);
      for(const p of outline(w-inset,h-inset,corner-inset,steps)){
        vertex(p.x,p.y,z,p.nx*radial/n,p.ny*radial/n,vertical/n);
      }
    }
    for(let row=1;row<rings.length;row++){
      const a=(row-1)*counts,c=row*counts;
      for(let j=0;j<counts;j++){
        const k=(j+1)%counts;
        indices.push(a+j,a+k,c+k,a+j,c+k,c+j);
      }
    }
    for(const face of (part==='front'?[1]:part==='rear'?[-1]:[-1,1])){
      const row=face<0?0:rings.length-1,first=row*counts,center=positions.length/3;
      vertex(0,0,rings[row][1],0,0,face);
      for(let j=0;j<counts;j++){
        const next=(j+1)%counts;
        if(face>0)indices.push(center,first+j,first+next);
        else indices.push(center,first+next,first+j);
      }
    }
    const boundary=outline(w-seamRing[0],h-seamRing[0],corner-seamRing[0],steps).map(p=>[p.x,p.y,seam]);
    return {positions,normals,indices,boundary};
  }

  function newCanvas(width,height){
    const c=document.createElement('canvas');c.width=width;c.height=height;return c;
  }
  function pngBlob(canvas){
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not encode the PNG.')),'image/png'));
  }
  function rotatePoint(x,y,z,pose){
    const [a,b,c]=pose,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cc=Math.cos(c),sc=Math.sin(c);
    const y1=cb*y-sb*z,z1=sb*y+cb*z,x2=ca*x+sa*z1;
    return [cc*x2-sc*y1,sc*x2+cc*y1,-sa*x+ca*z1];
  }
  const pauseForPaint=()=>new Promise(resolve=>setTimeout(resolve,0));

  class SlabRenderer {
    constructor(canvas) {
      this.canvas=canvas;
      this.sources={};
      this.cardShape=card;
      this.pose=[-16,8,-7].map(v=>v*Math.PI/180);
      this.zoom=1;this.light='softbox';this.strength=1;this.backdrop='pearl';
      this.generation=0;this.frame=0;this.settleTimer=0;
      const options={alpha:true,premultipliedAlpha:true,antialias:true,
        preserveDrawingBuffer:false,depth:true,stencil:false,powerPreference:'high-performance'};
      this.gl=canvas.getContext('webgl2',options);
      this.isWebGL2=!!this.gl;
      if(!this.gl)this.gl=canvas.getContext('webgl',options);
      if(this.gl){
        this.initialize();
        canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.generation++;clearTimeout(this.settleTimer);});
        canvas.addEventListener('webglcontextrestored',()=>{this.initialize();this.setTextures(this.sources);});
      }else{
        this.context2d=canvas.getContext('2d');
        if(!this.context2d)throw new Error('The canvas is unavailable.');
      }
      this.observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>this.request()):null;
      this.observer?.observe(canvas);this.request();
    }

    initialize(){
      const gl=this.gl;
      this.stageProgram=program(gl,this.isWebGL2,screenVertex,stageFragment);
      this.glassProgram=program(gl,this.isWebGL2,glassVertex,glassFragment,!!gl.getExtension('EXT_shader_texture_lod'));
      this.filters={};
      for(const n of [1,2,3,4])this.filters[n]=program(gl,this.isWebGL2,resolveVertex,resolveFragment(n));
      function buffer(target,data){
        const h=gl.createBuffer();gl.bindBuffer(target,h);gl.bufferData(target,data,gl.STATIC_DRAW);return h;
      }
      const shape=shellGeometry();
      this.points=buffer(gl.ARRAY_BUFFER,new Float32Array(shape.positions));
      this.normals=buffer(gl.ARRAY_BUFFER,new Float32Array(shape.normals));
      this.indices=buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(shape.indices));
      this.indexCount=shape.indices.length;
      this.screen=buffer(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]));
      this.maxTexture=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
      this.textures={};this.retired=[];this.activeExport=null;
      for(const key of textureKeys){
        const tex=this.newTexture();
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([237,237,236,255]));
        this.textures[key]=tex;
      }
      gl.useProgram(this.glassProgram.handle);
      textureKeys.forEach((key,i)=>gl.uniform1i(this.glassProgram.uniform[key[0].toUpperCase()+key.slice(1)],i));
    }
    newTexture(){
      const gl=this.gl,tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      return tex;
    }
    setTextures(sources){
      const gl=this.gl;
      for(const key of textureKeys){
        const src=sources[key];
        if(!src)continue;
        this.sources[key]=src;
        if(!gl||gl.isContextLost())continue;
        const w=src.naturalWidth||src.width,h=src.naturalHeight||src.height;
        const fit=Math.min(1,this.maxTexture/Math.max(w,h));
        const extent=v=>this.isWebGL2?Math.max(1,Math.round(v*fit)):Math.min(this.maxTexture,2**Math.ceil(Math.log2(v*fit)));
        const tw=extent(w),th=extent(h);
        let input=src;
        if(tw!==w||th!==h){
          input=newCanvas(tw,th);
          const ctx=input.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(src,0,0,tw,th);
        }
        const texture=this.newTexture();
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        if(this.anisotropy)gl.texParameterf(gl.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(12,gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        const old=this.textures[key];this.textures[key]=texture;
        if(old===this.activeExport?.textures[key])this.retired.push(old);else gl.deleteTexture(old);
      }
      this.request();
    }
    setCardFit(inset, radius) {
      if (!Number.isFinite(inset) || !Number.isFinite(radius)) return;
      const trim = Math.max(0, Math.min(2, inset));
      const r = Math.max(0, Math.min(6, radius));
      // The rail ends stay the same distance from the start of each corner arc.
      const railTrim = trim + (r - card.r);
      this.cardShape = {...card, w: card.w - 2*trim, h: card.h - 2*trim, r,
        horizontalRail: card.horizontalRail - railTrim, verticalRail: card.verticalRail - railTrim};
      this.request();
    }
    setPose(yaw, pitch, roll) {
      if (![yaw, pitch, roll].every(Number.isFinite)) return;
      this.pose = [yaw, pitch, roll].map(value => value * Math.PI / 180);
      this.request();
    }
    setLight(name, strength = 1) {
      this.light = Object.hasOwn(lightIds, name) ? name : 'softbox';
      this.strength = Number.isFinite(strength) ? Math.max(0, Math.min(2, strength)) : 1;
      this.request();
    }
    setBackdrop(name) { this.backdrop = Object.hasOwn(palettes, name) ? name : 'pearl'; this.request(); }
    setZoom(value) { this.zoom = Number.isFinite(value) ? Math.max(.25, Math.min(4, value)) : 1; this.request(); }

    request(){
      this.generation++;
      clearTimeout(this.settleTimer);
      if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();});
    }

    view(width,height,state=this){
      const scale=Math.min(height*.72/size.h,width*.76/size.w)*state.zoom;
      let floor=Infinity;
      const feet=[];
      for(const depth of [-size.d/2,size.d/2]){
        for(const p of outline(size.w/2,size.h/2,3.7,6)){
          const [x,y,z]=rotatePoint(p.x,p.y,depth,state.pose),f=520/(520-z);
          floor=Math.min(floor,y*f+1.5);feet.push([x*f,y*f+1.5]);
        }
      }
      // A broad upright contact patch stays on the optical axis through yaw/pitch.
      // Continuous roll weighting moves it toward the low corner as the slab leans.
      let total=0,mean=0,square=0;
      for(const [x,y] of feet){
        const weight=Math.exp(-(y-floor)/.73);
        total+=weight;mean+=weight*x;square+=weight*x*x;
      }
      mean/=total;
      const roll=Math.abs(Math.sin(state.pose[2]));
      const w=roll*roll/(roll*roll+.0156);
      const span=Math.sqrt(Math.max(0,square/total-mean*mean));
      return {scale,floor,contactX:w*mean,contactSpan:(1-w)*25+w*Math.max(10.5,span*.82)};
    }

    snapshot(){
      return {pose:[...this.pose],zoom:this.zoom,backdrop:this.backdrop,light:this.light,strength:this.strength,
        cardShape:this.cardShape,textures:{...this.textures}};
    }
    framebuffer(width,height,depth){
      const gl=this.gl,fb=gl.createFramebuffer(),tex=this.newTexture();
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      let db=null;
      if(depth){
        db=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,db);
        gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,db);
      }
      const target={fb,tex,db,width,height};
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
        this.freeBuffer(target);throw new Error('The graphics device could not allocate a render tile.');
      }
      return target;
    }
    freeBuffer(b){
      if(!b)return;
      this.gl.deleteFramebuffer(b.fb);
      this.gl.deleteTexture(b.tex);
      if(b.db)this.gl.deleteRenderbuffer(b.db);
    }
    quad(){
      const gl=this.gl;
      gl.disableVertexAttribArray(1);gl.bindBuffer(gl.ARRAY_BUFFER,this.screen);gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    scene(state,view,width,height,region,samples,target,clear){
      const gl=this.gl,tw=region.w*samples,th=region.h*samples;
      gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fb||null);gl.viewport(0,0,tw,th);
      gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);
      gl.depthMask(true);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);
      const palette=palettes[state.backdrop],rotation=new Float32Array([
        ...rotatePoint(1,0,0,state.pose),...rotatePoint(0,1,0,state.pose),...rotatePoint(0,0,1,state.pose)]);
      const uniforms=shader=>{
        gl.useProgram(shader.handle);
        const u=shader.uniform;
        gl.uniform2f(u.Full,width*samples,height*samples);gl.uniform2f(u.Origin,region.x*samples,region.y*samples);
        gl.uniform1f(u.Scale,view.scale*samples);gl.uniform1f(u.Floor,view.floor);
        gl.uniform1f(u.ContactX,view.contactX);gl.uniform1f(u.ContactSpan,view.contactSpan);
        gl.uniform3fv(u.Pale,palette[0]);gl.uniform3fv(u.Deep,palette[1]);gl.uniform1f(u.Clear,+clear);
      };
      uniforms(this.stageProgram);this.quad();
      uniforms(this.glassProgram);
      const u=this.glassProgram.uniform;
      gl.uniform2f(u.Target,tw,th);gl.uniform1f(u.Light,lightIds[state.light]);gl.uniform1f(u.Strength,state.strength);
      gl.uniform3f(u.CardShape,state.cardShape.w/2,state.cardShape.h/2,state.cardShape.r);
      gl.uniform2f(u.CardRails,state.cardShape.horizontalRail,state.cardShape.verticalRail);
      gl.uniformMatrix3fv(u.Rotation,false,rotation);
      textureKeys.forEach((key,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,state.textures[key]);});
      gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.points);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.normals);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
    }
    resolve(source,dest,x,y,w,h,samples,sw=source.width,sh=source.height){
      const gl=this.gl,filter=this.filters[samples];
      gl.bindFramebuffer(gl.FRAMEBUFFER,dest?.fb||null);gl.viewport(x,y,w,h);
      gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
      gl.useProgram(filter.handle);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.tex);
      gl.uniform1i(filter.uniform.Image,0);
      gl.uniform2f(filter.uniform.Texel,1/source.width,1/source.height);
      gl.uniform2f(filter.uniform.Extent,sw/source.width,sh/source.height);
      this.quad();
    }
    dimensions(){
      const cw=this.canvas.clientWidth,ch=this.canvas.clientHeight;
      const dpr=Math.min(2.5,Math.max(1.25,window.devicePixelRatio||1));
      const ratio=Math.min(dpr,Math.sqrt(3400000/Math.max(1,cw*ch)));
      return [Math.round(cw*ratio),Math.round(ch*ratio)];
    }
    render(){
      if(this.gl?.isContextLost())return;
      const [w,h]=this.dimensions();
      if(!w||!h)return;
      if(this.canvas.width!==w)this.canvas.width=w;
      if(this.canvas.height!==h)this.canvas.height=h;
      const view=this.view(w,h);
      if(!this.gl){this.drawFallback(w,h,view,false);return;}
      this.scene(this,view,w,h,{x:0,y:0,w,h},1,null,false);
      clearTimeout(this.settleTimer);
      const id=this.generation;
      this.settleTimer=setTimeout(()=>this.settle(id,w,h),160);
    }
    async settle(id,w,h){
      if(id!==this.generation||this.activeExport||this.gl.isContextLost())return;
      const samples=2,side=384,state=this.snapshot(),view=this.view(w,h,state);
      let tile,composite;
      try{
        tile=this.framebuffer(Math.min(w,side)*samples,Math.min(h,side)*samples,true);
        composite=this.framebuffer(w,h,false);
        let since=performance.now();
        for(let y=0;y<h;y+=side)for(let x=0;x<w;x+=side){
          if(id!==this.generation||this.activeExport||this.gl.isContextLost())return;
          const rw=Math.min(side,w-x),rh=Math.min(side,h-y);
          this.scene(state,view,w,h,{x,y,w:rw,h:rh},samples,tile,false);
          this.resolve(tile,composite,x,y,rw,rh,samples,rw*samples,rh*samples);
          if(performance.now()-since>9){await pauseForPaint();since=performance.now();}
        }
        this.resolve(composite,null,0,0,w,h,1);
      }catch(error){
        if(!this.gl.isContextLost())console.warn('The native-resolution preview is active.',error.message);
      }finally{
        this.freeBuffer(tile);this.freeBuffer(composite);this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null);
      }
    }
    async exportPNG({width=2160,height=2700,transparent=false,onProgress}={}){
      width=Math.round(width);height=Math.round(height);
      if(!(width>0&&height>0&&width<=8192&&height<=8192))throw new Error('Invalid export dimensions.');
      if(this.activeExport)throw new Error('An image is already being exported.');
      if(!this.gl){
        this.activeExport=this.snapshot();
        try{return await this.exportSoftware(width,height,transparent,onProgress);}
        finally{this.activeExport=null;}
      }
      const gl=this.gl,state=this.snapshot(),view=this.view(width,height,state);
      this.activeExport=state;this.generation++;clearTimeout(this.settleTimer);
      const side=256,samples=Math.max(width,height)<=2048?4:3;
      const tw=Math.min(side,width),th=Math.min(side,height);
      let high,low;
      try{
        high=this.framebuffer(tw*samples,th*samples,true);low=this.framebuffer(tw,th,false);
        const out=newCanvas(width,height),ctx=out.getContext('2d');
        const nx=Math.ceil(width/side),ny=Math.ceil(height/side),count=nx*ny;
        const raw=new Uint8Array(tw*th*4),backing=new Uint8ClampedArray(tw*th*4);
        let done=0,since=performance.now();
        onProgress?.(0);
        for(let y=0;y<height;y+=side)for(let x=0;x<width;x+=side){
          if(gl.isContextLost())throw new Error('The graphics device was interrupted during export.');
          const w=Math.min(side,width-x),h=Math.min(side,height-y);
          this.scene(state,view,width,height,{x,y,w,h},samples,high,transparent);
          this.resolve(high,low,0,0,w,h,samples,w*samples,h*samples);
          gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);
          const pixels=backing.subarray(0,w*h*4);
          for(let row=0;row<h;row++){
            const start=(h-1-row)*w*4,dest=row*w*4;
            pixels.set(raw.subarray(start,start+w*4),dest);
          }
          if(transparent){
            for(let i=0;i<pixels.length;i+=4){
              const alpha=pixels[i+3];
              if(alpha>0&&alpha<255){const inv=255/alpha;pixels[i]*=inv;pixels[i+1]*=inv;pixels[i+2]*=inv;}
            }
          }
          ctx.putImageData(new ImageData(pixels,w,h),x,height-y-h);
          onProgress?.(.97*(++done/count));
          if(performance.now()-since>18){await pauseForPaint();since=performance.now();}
        }
        const png=await pngBlob(out);onProgress?.(1);return png;
      }finally{
        this.freeBuffer(high);this.freeBuffer(low);
        for(const tex of this.retired)gl.deleteTexture(tex);
        this.retired=[];this.activeExport=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.request();
      }
    }

    async exportSoftware(width,height,transparent,onProgress){
      const scene=Object.assign(Object.create(Object.getPrototypeOf(this)),this.activeExport,{sources:{...this.sources}});
      const output=newCanvas(width,height),ctx=output.getContext('2d');
      const edge=384,samples=2,tw=Math.min(width,edge),th=Math.min(height,edge);
      scene.canvas=newCanvas(tw*samples,th*samples);
      scene.context2d=scene.canvas.getContext('2d');
      const rw=width*samples,rh=height*samples,view=scene.view(rw,rh);
      const count=Math.ceil(width/edge)*Math.ceil(height/edge);
      ctx.imageSmoothingQuality='high';
      let done=0,last=performance.now();
      onProgress?.(0);
      for(let y=0;y<height;y+=edge)for(let x=0;x<width;x+=edge){
        const w=Math.min(edge,width-x),h=Math.min(edge,height-y);
        scene.drawFallback(rw,rh,view,transparent,x*samples,y*samples);
        ctx.drawImage(scene.canvas,0,0,w*samples,h*samples,x,y,w,h);
        onProgress?.(.97*(++done/count));
        if(performance.now()-last>18){await pauseForPaint();last=performance.now();}
      }
      const blob=await pngBlob(output);onProgress?.(1);return blob;
    }

    exportGLB(){return buildGLB({...this.sources},this.cardShape);}
    drawFallback(width, height, view, transparent, originX=0, originY=0) {
      // A software projected mesh keeps uploads, orbit, and export usable without WebGL.
      const ctx = this.context2d, { scale, floor, contactX } = view;
      ctx.setTransform(1, 0, 0, 1, -originX, -originY);
      ctx.clearRect(0, 0, width, height);
      const css = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';
      if (!transparent) {
        const colors = palettes[this.backdrop], bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, css(colors[0])); bg.addColorStop(1, css(colors[1]));
        ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
        ctx.save(); ctx.translate(width / 2 + contactX * scale * .35, height / 2 - (floor - 1) * scale);
        ctx.scale(44 * scale, 4.1 * scale);
        const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        shade.addColorStop(0, 'rgba(25,23,33,.24)'); shade.addColorStop(1, 'rgba(25,23,33,0)');
        ctx.fillStyle = shade; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
      }
      const project = (x, y, z) => {
        const r = rotatePoint(x, y, z, this.pose);
        const s = 520 * scale / (520 - r[2]);
        return [width / 2 + s * r[0], height / 2 - s * r[1] - 1.5 * scale];
      };
      const nz = rotatePoint(0, 0, 1, this.pose)[2];
      const face = nz >= 0 ? 1 : -1;
      const trace = (cx, cy, w, h, radius, z) => {
        const points = outline(w / 2, h / 2, radius);
        ctx.beginPath();
        points.forEach((p, i) => {
          const q = project(p.x + cx, p.y + cy, z);
          if (i) ctx.lineTo(...q); else ctx.moveTo(...q);
        });
        ctx.closePath();
      };
      const ring = (cx, cy, w, h, r, z, stroke, weight, fill) => {
        trace(cx, cy, w, h, r, z);
        if (fill) {ctx.fillStyle = fill; ctx.fill();}
        ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(.35, weight * scale); ctx.stroke();
      };
      ring(0, 0, size.w, size.h, 3.7, -3.12 * face, 'rgba(73,73,87,.75)', .7, 'rgba(205,207,219,.38)');
      for (const z of [-2.3,-1.75,-.1,2.55,3.02]) {
        ring(0, 0, size.w - .42, size.h - .42, 3.6, z * face, 'rgba(248,249,255,.56)', .5);
      }
      ring(0, 0, size.w - 3.1, size.h - 3.1, 2.5, 3.36 * face, 'rgba(255,255,255,.89)', .65);
      ring(0, 0, size.w - 5.9, size.h - 5.9, 2, 1.43 * face, 'rgba(112,112,129,.60)', .47);
      ring(0,-14.95,73.04,98.5,1.28,1.3 * face,'rgba(252,252,255,.85)',.83);
      ring(0,37.63,73.36,1.35,.55,1.48*face,'rgba(111,116,129,.52)',.30);
      ring(0,37.83,73.34,1.30,.55,1.50*face,'rgba(253,254,255,.74)',.35);
      const fitted = this.cardShape;
      for(const direction of [-1,1]){
        ring(0,fitted.y+direction*(fitted.h/2+1.79),2*fitted.horizontalRail,.86,.41,1.48*face,'rgba(244,247,252,.72)',.33);
        ring(direction*(fitted.w/2+1.53),fitted.y,.82,2*fitted.verticalRail,.40,1.48*face,'rgba(239,244,251,.70)',.32);
      }
      for (const [r,key] of [[card,face > 0 ? 'front':'back'],[label,face > 0 ? 'label':'labelBack']]) {
        const src = this.sources[key];
        const cut = r === card ? fitted : r;
        ring(cut.x, cut.y, cut.w+1.8,cut.h+1.8,cut.r,1.44 * face,'rgba(88,90,104,.62)',.48);
        ctx.save(); trace(cut.x, cut.y, cut.w, cut.h, cut.r, .2*face); ctx.clip();
        if (src) {
          drawProjectedImage(ctx, src, (u, v) => project(r.x + (u-.5)*r.w*face,r.y+(.5-v)*r.h,.2*face));
        } else {ctx.fillStyle='#efeeee';ctx.fillRect(0,0,width,height);}
        ctx.restore();
      }
      trace(0,0,size.w,size.h,3.7,3.14*face);
      const highlight=ctx.createLinearGradient(width*.27,0,width*.76,height*.42);
      const gloss = [.02,.052,.015][lightIds[this.light]] * this.strength + (1-Math.abs(nz))*.12;
      highlight.addColorStop(0,'rgba(255,255,255,0)');
      highlight.addColorStop(.43,'rgba(255,255,255,'+(gloss+.11)+')');
      highlight.addColorStop(.50,'rgba(255,255,255,'+gloss+')');
      highlight.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=highlight;ctx.fill();
    }
  }

  function drawProjectedImage(ctx, image, project) {
    const width=image.naturalWidth||image.width, height=image.naturalHeight||image.height;
    const rows=6, columns=4;
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const a=[x/columns,y/rows], b=[(x+1)/columns,y/rows];
      const c=[(x+1)/columns,(y+1)/rows], d=[x/columns,(y+1)/rows];
      for(const tri of [[a,b,d],[c,d,b]]) {
        const [p,q,r]=tri.map(uv=>project(...uv));
        const [i,j,k]=tri, fx=(j[0]-i[0])*width, fy=(k[1]-i[1])*height;
        const A=(q[0]-p[0])/fx, B=(q[1]-p[1])/fx, C=(r[0]-p[0])/fy, D=(r[1]-p[1])/fy;
        // Overlap adjacent affine tiles by a fraction of a pixel inside the
        // outer rounded clip; independent antialiased triangle cuts leave pinholes.
        const center=[(p[0]+q[0]+r[0])/3,(p[1]+q[1]+r[1])/3];
        const expand=pt=>{const dx=pt[0]-center[0],dy=pt[1]-center[1],k=.86/Math.max(1,Math.hypot(dx,dy));return [pt[0]+dx*k,pt[1]+dy*k];};
        ctx.save();ctx.beginPath();ctx.moveTo(...expand(p));ctx.lineTo(...expand(q));ctx.lineTo(...expand(r));ctx.closePath();ctx.clip();
        ctx.transform(A,B,C,D,p[0]-A*i[0]*width-C*i[1]*height,p[1]-B*i[0]*width-D*i[1]*height);
        ctx.drawImage(image,0,0);ctx.restore();
      }
    }
  }

  function outline(halfW, halfH, radius, steps = 12) {
    const points = [];
    radius=Math.max(.0001,Math.min(radius,halfW,halfH));
    const corners = [[1,1],[-1,1],[-1,-1],[1,-1]];
    corners.forEach(([sx,sy], i) => {
      for (let j=0;j<=steps;j++) {
        const angle=(i+j/steps)*Math.PI/2;
        const nx=Math.cos(angle), ny=Math.sin(angle);
        points.push({x:sx*(halfW-radius)+radius*nx,y:sy*(halfH-radius)+radius*ny,nx,ny});
      }
    });
    return points;
  }

  // Build a single closed optical solid for each molded half. The recesses and
  // retaining lands belong to its inner surface, so light crosses one boundary
  // there, even where a rail runs into a corner.
  function moldInterior(side, fitted) {
    const shell = shellGeometry(side > 0 ? 'front' : 'rear');
    const halfWidth = size.w / 2, halfHeight = size.h / 2;
    const innerInset = 2.02, w = halfWidth-innerInset, h = halfHeight-innerInset;
    const g = {
      p: shell.positions.map(mm => mm * .001), n: shell.normals,
      i: shell.indices, toolIndices: [], uv: []
    };
    const features = [];
    function feature(x, y, hw, hh, radius, width, lift, bead = false) {
      features.push({x,y,hw,hh,radius:Math.min(radius,hw,hh),width,lift,bead});
    }
    feature(0,0,halfWidth-2.95,halfHeight-2.95,1.94,.49,-.25,true);
    feature(0,-14.95,36.52,49.25,1.64,.51,.20);
    feature(fitted.x,fitted.y,fitted.w/2+1.05,fitted.h/2+1.05,Math.max(0,fitted.r-.1),.48,.48);
    feature(label.x,label.y,label.w/2+1.01,label.h/2+1.01,1.24,.52,.68);
    feature(0,37.63,36.67,.67,.56,.35,-.27);
    for (const direction of [-1,1]) {
      feature(0,fitted.y+direction*(fitted.h/2+1.79),fitted.horizontalRail,.43,.42,.33,-.28);
      feature(direction*(fitted.w/2+1.53),fitted.y,.41,fitted.verticalRail,.40,.32,-.24);
    }
    function field(x,y) {
      let height=.80, sx=0, sy=0;
      for (const f of features) {
        const px=x-f.x, py=y-f.y, qx=Math.abs(px)-f.hw+f.radius, qy=Math.abs(py)-f.hh+f.radius;
        const ax=Math.max(qx,0), ay=Math.max(qy,0), arc=Math.hypot(ax,ay);
        const distance=arc+Math.min(Math.max(qx,qy),0)-f.radius;
        let value, gradient;
        if (f.bead) {
          const t=distance/f.width;
          value=f.lift*Math.exp(-.5*t*t);
          gradient=-value*t/f.width;
        } else {
          const t=Math.min(1,Math.max(0,.5-distance/(4*f.width)));
          value=f.lift*t*t*(3-2*t);
          gradient=-f.lift*6*t*(1-t)/(4*f.width);
        }
        height+=value;
        const nx=arc>0 ? ax/arc : Number(qx>qy);
        const ny=arc>0 ? ay/arc : Number(qy>=qx);
        sx+=gradient*nx*Math.sign(px);
        sy+=gradient*ny*Math.sign(py);
      }
      // Die out into the flat shoulder where the stepped wall joins the floor.
      const corner=3.7-innerInset;
      const qx=Math.abs(x)-w+corner, qy=Math.abs(y)-h+corner;
      const ax=Math.max(qx,0), ay=Math.max(qy,0), arc=Math.hypot(ax,ay);
      const distance=arc+Math.min(Math.max(qx,qy),0)-corner;
      const t=Math.min(1,Math.max(0,-distance/.44));
      const blend=t*t*(3-2*t), slope=-(height-.80)*6*t*(1-t)/.44;
      const nx=arc>0?ax/arc:Number(qx>qy), ny=arc>0?ay/arc:Number(qy>=qx);
      return {height:.80+blend*(height-.80),
        sx:blend*sx+slope*nx*Math.sign(x), sy:blend*sy+slope*ny*Math.sign(y)};
    }
    // Sample tightly across curved tooling and sparsely through flat paper windows.
    function samplingAxis(limit, center, extent) {
      const intervals=[];
      for (const f of features) {
        for (const direction of [-1,1]) {
          const lip=f[center]+direction*f[extent], turn=lip-direction*f.radius;
          intervals.push([Math.min(lip,turn)-2.5*f.width,Math.max(lip,turn)+2.5*f.width]);
        }
      }
      intervals.push([-limit,-limit+1.8],[limit-1.8,limit]);
      const cuts=[-limit,limit];
      for (const range of intervals) for(const v of range) if(v>-limit && v<limit)cuts.push(v);
      cuts.sort((a,b)=>a-b);
      const points=[cuts[0]];
      for(let i=1;i<cuts.length;i++) {
        const a=points[points.length-1], b=cuts[i];
        if(b-a<.0001) continue;
        const middle=(a+b)/2;
        const dense=intervals.some(([lo,hi])=>middle>=lo && middle<=hi);
        const count=Math.ceil((b-a)/(dense?.16:4));
        for(let j=1;j<=count;j++)points.push(a+(b-a)*j/count);
      }
      return points;
    }
    const xs=samplingAxis(w,'x','hw'), ys=samplingAxis(h,'y','hh');
    const gridStart=g.p.length/3;
    const perimeter=[];
    function add(x,y,z,nx,ny,nz) {
      g.p.push(x*.001,y*.001,z*.001);
      const length=Math.hypot(nx,ny,nz);
      g.n.push(nx/length,ny/length,nz/length);
      return g.p.length/3-1;
    }
    const rad=3.7-innerInset;
    for(let j=0;j<ys.length;j++) for(let i=0;i<xs.length;i++) {
      let x=xs[i], y=ys[j];
      const u=(Math.abs(x)-w+rad)/rad, v=(Math.abs(y)-h+rad)/rad;
      if (u>0 && v>0) {
        x=Math.sign(x)*(w-rad+rad*u*Math.sqrt(1-.5*v*v));
        y=Math.sign(y)*(h-rad+rad*v*Math.sqrt(1-.5*u*u));
      }
      const p=field(x,y);
      const id=add(x,y,side*p.height,p.sx,p.sy,-side);
      if(i===0 || j===0 || i===xs.length-1 || j===ys.length-1) perimeter.push(id);
      if(i && j) {
        const left=id-1, below=id-xs.length, lowLeft=below-1;
        const indices=p.height<1.455 ? g.toolIndices : g.i;
        if(side<0)indices.push(lowLeft,below,id,lowLeft,id,left);
        else indices.push(lowLeft,id,below,lowLeft,left,id);
      }
    }
    function zipper(outer,inner) {
      // Both contours are convex. Ordering by polar angle advances the two
      // tessellations without welding long straight edges to a single corner.
      const ring=ids=>ids.map(id=>({id,a:Math.atan2(g.p[id*3+1],g.p[id*3])})).sort((a,b)=>a.a-b.a);
      const a=ring(outer), b=ring(inner);
      let i=0,j=0;
      function tri(u,v,k){if(side<0)g.i.push(u,v,k);else g.i.push(u,k,v);}
      while(i<a.length || j<b.length) {
        const curA=a[i%a.length], curB=b[j%b.length];
        const nextA=a[(i+1)%a.length],nextB=b[(j+1)%b.length];
        const angleA=i>=a.length?Infinity:nextA.a+(i+1===a.length?2*Math.PI:0);
        const angleB=j>=b.length?Infinity:nextB.a+(j+1===b.length?2*Math.PI:0);
        if(angleA<=angleB){tri(curA.id,nextA.id,curB.id);i++;}
        else{tri(curA.id,nextB.id,curB.id);j++;}
      }
    }
    // Let a narrow optical joint separate the two shells. The offsets taper
    // out within 0.2 mm and preserve the exterior dimensions.
    const seamZ=shell.boundary[0][2], seamOffset=.014*side;
    for(let i=2;i<gridStart*3;i+=3) {
      const offset=Math.abs(g.p[i]*1000-seamZ);
      if(offset<.2) g.p[i]+=seamOffset*.001*(1-offset/.2);
    }
    const cut=.158;
    const shoulder=side>0 ? [[cut,seamZ+seamOffset],[.29,-1.73],[1.16,-1.72],[1.41,-1.58],
      [1.50,-1.34],[1.51,.41],[1.59,.62],[1.75,.78],[1.88,.80]] :
      [[cut,seamZ+seamOffset],[.33,-1.83],[1.38,-1.85],[1.55,-1.78],[1.61,-1.62],[1.64,-.98],[1.76,-.82],[1.88,-.80]];
    let previous;
    for(let row=0;row<shoulder.length;row++) {
      const [inset,z]=shoulder[row];
      const last=shoulder[Math.max(0,row-1)], next=shoulder[Math.min(shoulder.length-1,row+1)];
      const di=next[0]-last[0],dz=next[1]-last[1];
      const ids=shell.boundary.map(([x,y])=>{
        const nx=x-Math.max(-halfWidth+3.7,Math.min(halfWidth-3.7,x));
        const ny=y-Math.max(-halfHeight+3.7,Math.min(halfHeight-3.7,y));
        const length=Math.hypot(nx,ny), ux=nx/length,uy=ny/length;
        if(row===shoulder.length-1) return add(x-ux*(inset-cut),y-uy*(inset-cut),z,0,0,-side);
        return add(x-ux*(inset-cut),y-uy*(inset-cut),z,-side*ux*dz,-side*uy*dz,-side*di);
      });
      if(previous)zipper(previous,ids);
      previous=ids;
    }
    zipper(previous,perimeter);
    return g;
  }

  async function buildGLB(sources, cardShape) {
    const doc = {
      asset: { version:'2.0', generator:'Slab Studio 2' }, scene:0, scenes:[{name:'Graded card holder',nodes:[]}],
      nodes:[], meshes:[], materials:[], accessors:[], bufferViews:[], buffers:[],
      images:[], textures:[], samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],
      extensionsUsed:['KHR_materials_transmission','KHR_materials_ior','KHR_materials_volume']
    };
    const chunks=[];
    let offset=0;
    function store(data, target) {
      const block=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
      const view={buffer:0,byteOffset:offset,byteLength:block.length};
      if(target) view.target=target;
      chunks.push({offset,block});
      offset=(offset+block.length+3)&~3;
      return doc.bufferViews.push(view)-1;
    }
    function accessor(array,type,components,position=false) {
      const index=type==='SCALAR';
      const wide=index && array.some(value=>value>65535);
      const data=index ? (wide?new Uint32Array(array):new Uint16Array(array)) : new Float32Array(array);
      const view=store(data,type==='SCALAR'?34963:34962);
      const info={bufferView:view,componentType:index?(wide?5125:5123):5126,count:array.length/components,type};
      if(position) {
        const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
        for(let i=0;i<data.length;i++){const j=i%3;min[j]=Math.min(min[j],data[i]);max[j]=Math.max(max[j],data[i]);}
        info.min=min;info.max=max;
      }
      return doc.accessors.push(info)-1;
    }
    function primitive(g, material) {
      const attributes={POSITION:accessor(g.p,'VEC3',3,true),NORMAL:accessor(g.n,'VEC3',3)};
      if(g.uv.length)attributes.TEXCOORD_0=accessor(g.uv,'VEC2',2);
      return {attributes,indices:accessor(g.i,'SCALAR',1),material};
    }
    function mesh(name,g,material) {
      const surface=primitive(g,material);
      const item={name,primitives:[surface]};
      if(g.toolIndices?.length) {
        item.primitives.push({attributes:surface.attributes,indices:accessor(g.toolIndices,'SCALAR',1),material:molded});
      }
      const index=doc.meshes.push(item)-1;
      doc.scenes[0].nodes.push(doc.nodes.push({name,mesh:index})-1);
      return item;
    }
    function optical(name,roughness,thickness) {
      return doc.materials.push({name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,
        roughnessFactor:roughness},extensions:{
        KHR_materials_transmission:{transmissionFactor:1},KHR_materials_ior:{ior:1.49},
        KHR_materials_volume:{thicknessFactor:thickness,attenuationDistance:.40,attenuationColor:[.955,.965,.995]}
      }})-1;
    }
    const clear=optical('Polished clear polymer',.047,.00165);
    const molded=optical('Microtextured mold interior',.15,.002);
    const paperEdge=doc.materials.push({name:'Paper stock edge',pbrMetallicRoughness:{
      baseColorFactor:[.81,.786,.738,1],metallicFactor:0,roughnessFactor:.85}})-1;
    const ink={};
    for(const key of textureKeys) {
      const src=sources[key];
      const pbr={metallicFactor:0,roughnessFactor:.72};
      if(src) {
        const w=src.naturalWidth||src.width,h=src.naturalHeight||src.height;
        const canvas=newCanvas(w,h),cx=canvas.getContext('2d');
        cx.fillStyle='#f5f5f5';cx.fillRect(0,0,w,h);cx.drawImage(src,0,0);
        const bytes=new Uint8Array(await (await pngBlob(canvas)).arrayBuffer());
        const image=doc.images.push({name:key,mimeType:'image/png',bufferView:store(bytes)})-1;
        pbr.baseColorTexture={index:doc.textures.push({source:image,sampler:0})-1};
      } else pbr.baseColorFactor=[.92,.92,.92,1];
      ink[key]=doc.materials.push({name:key,pbrMetallicRoughness:pbr})-1;
    }
    const geometry=()=>({p:[],n:[],uv:[],i:[]});
    const vertex=(g,x,y,z,nx,ny,nz) => {
      g.p.push(x*.001,y*.001,z*.001);g.n.push(nx,ny,nz);
      return g.p.length/3-1;
    };
    function stockEdge(item) {
      const g=geometry(),points=outline(item.w/2,item.h/2,item.r,30);
      for(const depth of [-.2,.2]) for(const p of points) {
        vertex(g,item.x+p.x,item.y+p.y,depth,p.nx,p.ny,0);
      }
      const count=points.length;
      for(let j=0;j<count;j++){
        const k=(j+1)%count;
        g.i.push(j,k,count+k,j,count+k,count+j);
      }
      return g;
    }
    function cap(g,cut,print,sign) {
      const z=sign*.20;
      const start=vertex(g,cut.x,cut.y,z,0,0,sign);
      g.uv.push(.5,.5);
      const points=outline(cut.w/2,cut.h/2,cut.r,30);
      for(const p of points){
        vertex(g,cut.x+p.x,cut.y+p.y,z,0,0,sign);
        g.uv.push(.5+sign*p.x/print.w,.5-p.y/print.h);
      }
      for(let j=0;j<points.length;j++){
        const a=start+j+1,b=start+(j+1)%points.length+1;
        if(sign>0)g.i.push(start,a,b);else g.i.push(start,b,a);
      }
    }
    mesh('Front molded shell',moldInterior(1,cardShape),clear);
    mesh('Rear molded shell',moldInterior(-1,cardShape),clear);
    for(const [item,front,back,name] of [[card,'front','back','Card'],[label,'label','labelBack','Label']]){
      const {x,y,w,h}=item;
      const cut=item===card ? cardShape : item;
      mesh(name+' stock edge',stockEdge(cut),paperEdge);
      for(const [key,s] of [[front,1],[back,-1]]){
        const g=geometry();
        cap(g,cut,item,s);
        const face=mesh(name+(s>0?' front':' back'),g,ink[key]);
        if(item===label) {
          // The thin metalized label stamp shares the registered ink texture.
          const points=s>0?[[670,316],[670,448],[874,448],[874,316]]:
            [[614,0],[614,210],[768,261],[922,210],[922,0]];
          const stamp=geometry();
          for(const [px,py] of points){
            const u=px/1536,v=py/448;
            vertex(stamp,x+s*(u-.5)*w,y+(.5-v)*h,s*.224,0,0,s);
            stamp.uv.push(u,v);
          }
          for(let i=1;i<points.length-1;i++)stamp.i.push(0,i,i+1);
          const print=doc.materials[ink[key]].pbrMetallicRoughness;
          const foil=doc.materials.push({name:name+(s>0?' front':' back')+' silver foil',pbrMetallicRoughness:{
            ...print,metallicFactor:.71,roughnessFactor:.29}})-1;
          face.primitives.push(primitive(stamp,foil));
        }
      }
    }
    doc.buffers=[{byteLength:offset}];
    const json=new TextEncoder().encode(JSON.stringify(doc));
    const jsonSize=(json.length+3)&~3,binStart=28+jsonSize;
    const buffer=new ArrayBuffer(binStart+offset),view=new DataView(buffer),bytes=new Uint8Array(buffer);
    view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,buffer.byteLength,true);
    view.setUint32(12,jsonSize,true);view.setUint32(16,0x4e4f534a,true);
    bytes.fill(32,20,20+jsonSize);bytes.set(json,20);
    view.setUint32(20+jsonSize,offset,true);view.setUint32(24+jsonSize,0x004e4942,true);
    for(const part of chunks)bytes.set(part.block,binStart+part.offset);
    return new Blob([buffer],{type:'model/gltf-binary'});
  }
  window.SlabRenderer=SlabRenderer;
})();
