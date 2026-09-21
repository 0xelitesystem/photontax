// GENERATED FILE. Do not edit; edit the modules under src/globe and src/render and run
// the build. This is the decorative half of photontax: the WebGL2 renderer, its geometry, its
// shaders, the SVG fallback and the Natural Earth coastline. index.html fetches it AFTER that
// page has painted, because the page states that the table is the result and the globe is
// decorative, and a decoration does not belong in front of first contentful paint.
(function () {
var __m = window.__photontax;
if (!__m) return;

__m["src/globe/mat4.js"] = (function () {
function $(){let m=new Float64Array(16);m[0]=1;m[5]=1;m[10]=1;m[15]=1;return m;}
function am(a,b){let j=new Float64Array(16);for(let c=0;c<4;c++){for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];j[c*4+r]=s;}}
return j;}
function ao(ad,aa,R,W){if(!(ad>0)||!(aa>0)||!(R>0)||!(W>R)){throw new RangeError('perspective: needs fovY > 0, aspect > 0, 0 < near < far');}
let f=1/Math.tan(ad/2);let nf=1/(R-W);let m=new Float64Array(16);m[0]=f/aa;m[5]=f;m[10]=(W+R)*nf;m[11]=-1;m[14]=2*W*R*nf;return m;}
function al(E,target,up){let zx=E.x-target.x;let zy=E.y-target.y;let zz=E.z-target.z;let _=Math.hypot(zx,zy,zz);if(_===0)throw new RangeError('lookAt: eye and target coincide, the view has no forward axis');let z={x:zx/_,y:zy/_,z:zz/_};let x=U(up,z);let T=length(x);if(T<1e-12){let aj=Math.abs(z.y)<0.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};x=U(aj,z);T=length(x);}
x={x:x.x/T,y:x.y/T,z:x.z/T};let y=U(z,x);let m=new Float64Array(16);m[0]=x.x;m[4]=x.y;m[8]=x.z;m[12]=-V(x,E);m[1]=y.x;m[5]=y.y;m[9]=y.z;m[13]=-V(y,E);m[2]=z.x;m[6]=z.y;m[10]=z.z;m[14]=-V(z,E);m[15]=1;return m;}
function aq(S){let c=Math.cos(S);let s=Math.sin(S);let m=$();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
function ap(S){let c=Math.cos(S);let s=Math.sin(S);let m=$();m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
function aw(m,v){return{x:m[0]*v.x+m[4]*v.y+m[8]*v.z+m[12],y:m[1]*v.x+m[5]*v.y+m[9]*v.z+m[13],z:m[2]*v.x+m[6]*v.y+m[10]*v.z+m[14],w:m[3]*v.x+m[7]*v.y+m[11]*v.z+m[15],};}
function av(m,v){return{x:m[0]*v.x+m[4]*v.y+m[8]*v.z,y:m[1]*v.x+m[5]*v.y+m[9]*v.z,z:m[2]*v.x+m[6]*v.y+m[10]*v.z,};}
function U(a,b){return{x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x,};}
function V(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
function length(a){return Math.hypot(a.x,a.y,a.z);}
function an(a){let l=length(a);if(l===0)throw new RangeError('normalize: the zero vector has no direction');return{x:a.x/l,y:a.y/l,z:a.z/l};}
function ar(a,k){return{x:a.x*k,y:a.y*k,z:a.z*k};}
function ai(a,b){return{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};}
function at(a,b){return{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
function ak(m){let A=m[0],a01=m[1],a02=m[2],a03=m[3];let B=m[4],a11=m[5],a12=m[6],a13=m[7];let C=m[8],a21=m[9],a22=m[10],a23=m[11];let D=m[12],a31=m[13],a32=m[14],a33=m[15];let F=A*a11-a01*B;let G=A*a12-a02*B;let H=A*a13-a03*B;let I=a01*a12-a02*a11;let J=a01*a13-a03*a11;let K=a02*a13-a03*a12;let L=C*a31-a21*D;let M=C*a32-a22*D;let N=C*a33-a23*D;let O=a21*a32-a22*a31;let P=a21*a33-a23*a31;let Q=a22*a33-a23*a32;let ab=F*Q-G*P+H*O+I*N-J*M+K*L;if(ab===0)throw new RangeError('invert: singular matrix');let d=1/ab;let j=new Float64Array(16);j[0]=(a11*Q-a12*P+a13*O)*d;j[1]=(a02*P-a01*Q-a03*O)*d;j[2]=(a31*K-a32*J+a33*I)*d;j[3]=(a22*J-a21*K-a23*I)*d;j[4]=(a12*N-B*Q-a13*M)*d;j[5]=(A*Q-a02*N+a03*M)*d;j[6]=(a32*H-D*K-a33*G)*d;j[7]=(C*K-a22*H+a23*G)*d;j[8]=(B*P-a11*N+a13*L)*d;j[9]=(a01*N-A*P-a03*L)*d;j[10]=(D*J-a31*H+a33*F)*d;j[11]=(a21*H-C*J-a23*F)*d;j[12]=(a11*M-B*O-a12*L)*d;j[13]=(A*O-a01*M+a02*L)*d;j[14]=(a31*G-D*I-a32*F)*d;j[15]=(C*I-a21*G+a22*F)*d;return j;}
function au(m){return new Float32Array(m);}
return{add:ai,cross:U,dot:V,identity:$,invert:ak,length,lookAt:al,multiply:am,normalize:an,perspective:ao,rotationX:ap,rotationY:aq,scale:ar,sub:at,toFloat32:au,transformDirection:av,transformPoint:aw};
})();
__m["src/globe/camera.js"] = (function () {
let{lookAt,perspective,multiply}=__m["src/globe/mat4.js"];let j=(35*Math.PI)/180;let i=1;let ad=1.001;let ae=1.0005;let I=2.5;let K=0.35;let F=0.8;let G=3;let u=80;let o=8;let n=6;let q=1.15;let f=Math.PI/180;function l(W){if(!(W>0))throw new RangeError('distanceForNdcRadius: ndcRadius must be positive');let t=Math.tan(j/2);let s=1/(W*t);return Math.sqrt(s*s+1);}
function ar(w){if(!(w>1))throw new RangeError('ndcRadiusForDistance: the camera is inside the globe');return 1/(Math.sqrt(w*w-1)*Math.tan(j/2));}
let J=l(I);let H=l(K);let E=l(F);function O(m){return b({yawDeg:m?m.lon:0,pitchDeg:m?m.lat:12,distance:E,});}
function b(c){let au=((c.yawDeg%360)+540)%360-180;return{yawDeg:au,pitchDeg:Math.max(-u,Math.min(u,c.pitchDeg)),distance:Math.max(J,Math.min(H,c.distance)),};}
function af(c,P,V){if(V.reducedMotion||V.interacted)return c;if(!(P>0))return c;return b({...c,yawDeg:c.yawDeg+G*P});}
function Q(c){let p=c.pitchDeg*f;let y=c.yawDeg*f;let N=Math.cos(p);return{x:N*Math.cos(y)*c.distance,y:Math.sin(p)*c.distance,z:N*Math.sin(y)*c.distance,};}
function aj(ao,aq,C=i){let T=ao*f;let U=aq*f;let M=Math.cos(T);return{x:M*Math.cos(U)*C,y:Math.sin(T)*C,z:M*Math.sin(U)*C,};}
function at(v){let r=Math.hypot(v.x,v.y,v.z);if(r===0)throw new RangeError('vec3ToCoord: the origin has no coordinate');return{lat:Math.asin(Math.max(-1,Math.min(1,v.y/r)))/f,lon:Math.atan2(v.z,v.x)/f,};}
function ah(c,ab,S){if(!(ab>0)||!(S>0)){throw new RangeError('cameraMatrices: the viewport has no area');}
let d=Q(c);let X=(c.distance-i)*0.5;let R=c.distance+i*1.5;let L=ab/S;let aa=lookAt(d,{x:0,y:0,z:0},{x:0,y:1,z:0});let Z=perspective(j,L,X,R);return{view:aa,proj:Z,viewProj:multiply(Z,aa),eye:d,near:X,far:R,aspect:L};}
function ag(c,an){switch(an){case'ArrowLeft':
return{camera:b({...c,yawDeg:c.yawDeg-o}),announce:'Rotated west.'};case'ArrowRight':
return{camera:b({...c,yawDeg:c.yawDeg+o}),announce:'Rotated east.'};case'ArrowUp':
return{camera:b({...c,pitchDeg:c.pitchDeg+n}),announce:'Rotated north.'};case'ArrowDown':
return{camera:b({...c,pitchDeg:c.pitchDeg-n}),announce:'Rotated south.'};case'+':
case'=':
return{camera:b({...c,distance:c.distance/q}),announce:'Zoomed in.'};case'-':
case'_':
return{camera:b({...c,distance:c.distance*q}),announce:'Zoomed out.'};case'Home':
return{camera:O(),announce:'View reset.'};default:
return null;}}
function ai(c,g){return b({...c,yawDeg:g.lon,pitchDeg:g.lat});}
function ap(from,g,t){let k=Math.max(0,Math.min(1,t));let al=((g.yawDeg-from.yawDeg)%360+540)%360-180;return b({yawDeg:from.yawDeg+al*k,pitchDeg:from.pitchDeg+(g.pitchDeg-from.pitchDeg)*k,distance:from.distance+(g.distance-from.distance)*k,});}
function am(p,d){let Y=Math.hypot(p.x,p.y,p.z);let A=Math.hypot(d.x,d.y,d.z);if(Y===0||A===0)return false;let ak=(p.x*d.x+p.y*d.y+p.z*d.z)/(Y*A);return ak>(i/A);}
return{ARC_RADIUS:ad,COASTLINE_RADIUS:ae,DEFAULT_DISTANCE:E,DEFAULT_NDC_RADIUS:F,FOV_Y_RAD:j,GLOBE_RADIUS:i,IDLE_SPIN_DEG_PER_SEC:G,KEY_PITCH_STEP_DEG:n,KEY_YAW_STEP_DEG:o,KEY_ZOOM_STEP:q,MAX_DISTANCE:H,MAX_NDC_RADIUS:I,MAX_PITCH_DEG:u,MIN_DISTANCE:J,MIN_NDC_RADIUS:K,advanceIdleSpin:af,cameraKey:ag,cameraMatrices:ah,cameraOver:ai,clampCamera:b,coordToVec3:aj,createCamera:O,distanceForNdcRadius:l,eyeOf:Q,isFrontFacing:am,lerpCamera:ap,ndcRadiusForDistance:ar,vec3ToCoord:at};
})();
__m["src/globe/coastline-data.js"] = (function () {
let a=
'Coastline: Natural Earth 110m, public domain. Crediting is not required; credited anyway.';let c=100;let d=Object.freeze({sourceFeatures:134,sourcePoints:5128,lines:134,points:5022,binaryBytes:13796,base64Bytes:18396,});let b=
'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';return{COASTLINE_ATTRIBUTION:a,COASTLINE_B64:b,COASTLINE_QUANT:c,COASTLINE_STATS:d};
})();
__m["src/globe/coastline.js"] = (function () {
let{COASTLINE_B64,COASTLINE_QUANT,COASTLINE_STATS,COASTLINE_ATTRIBUTION}=__m["src/globe/coastline-data.js"];function o(D){if(typeof atob!=='function'){throw new Error('base64ToBytes: no atob in this environment. Node 16 and later provide it '
+'globally, and every browser this page supports has had it for two decades.');}
let g=atob(D);let y=new Uint8Array(g.length);for(let i=0;i<g.length;i++)y[i]=g.charCodeAt(i);return y;}
function r(d,z=COASTLINE_QUANT){let c=0;let f=()=>{let A=0;let l=0;for(;;){if(c>=d.length)throw new RangeError('decodeCoastline: stream ended inside a varint');let b=d[c];c+=1;A|=(b&0x7f)<<l;if((b&0x80)===0)return A>>>0;l+=7;if(l>28)throw new RangeError('decodeCoastline: varint wider than 32 bits');}};let C=(u)=>(u>>>1)^-(u&1);let h=f();let w=new Uint32Array(h);let v=new Uint32Array(h);let j=[];let t=[];let q=0;let p=0;for(let i=0;i<h;i++){let n=f();w[i]=j.length;v[i]=n;for(let k=0;k<n;k++){q+=C(f());p+=C(f());j.push(q/z);t.push(p/z);}}
if(c!==d.length){throw new RangeError('decodeCoastline: '+(d.length-c)+' trailing bytes. The '
+'payload and the decoder disagree about the format, which means the shipped map is not '
+'the map the generator produced.');}
return{lon:Float64Array.from(j),lat:Float64Array.from(t),lineStart:w,lineCount:v,};}
let e=null;function E(){if(e===null)e=r(o(COASTLINE_B64));return e;}
function F(){e=null;}
return{COASTLINE_ATTRIBUTION,COASTLINE_QUANT,COASTLINE_STATS,base64ToBytes:o,coastline:E,decodeCoastline:r,resetCoastlineCache:F};
})();
__m["src/globe/geometry.js"] = (function () {
let{ARC_RADIUS,COASTLINE_RADIUS,GLOBE_RADIUS,coordToVec3}=__m["src/globe/camera.js"];let{coastline}=__m["src/globe/coastline.js"];let T=8;let S=6;let ac=1;let ab=8;function ao(G){let V=0;let ai=0;for(let s of G){if(s.length<2)continue;V+=s.length;ai+=s.length-1;}
let o=new Float32Array(V*2*T);let j=new Uint32Array(ai*6);let X=[];let v=0;let i=0;let ae=0;for(let s of G){if(s.length<2){X.push({first:i,count:0});continue;}
let n=s.length;let L=new Float64Array(n);for(let k=1;k<n;k++){let a=s[k-1];let b=s[k];L[k]=L[k-1]+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);}
let aA=L[n-1]||1;for(let k=0;k<n;k++){let W=s[Math.max(0,k-1)];let U=s[Math.min(n-1,k+1)];let _=U.x-W.x;let $=U.y-W.y;let tz=U.z-W.z;let Q=Math.hypot(_,$,tz);if(Q>0){_/=Q;$/=Q;tz/=Q;}
let p=s[k];let t=L[k]/aA;for(let az of[-1,1]){o[v+0]=p.x;o[v+1]=p.y;o[v+2]=p.z;o[v+3]=_;o[v+4]=$;o[v+5]=tz;o[v+6]=az;o[v+7]=t;v+=T;}}
let ag=i;for(let k=0;k<n-1;k++){let a=ae+k*2;j[i+0]=a;j[i+1]=a+1;j[i+2]=a+2;j[i+3]=a+1;j[i+4]=a+3;j[i+5]=a+2;i+=6;}
X.push({first:ag,count:i-ag});ae+=n*2;}
return{vertices:o,indices:j,vertexCount:V*2,ranges:X};}
function ay(from,to,A=ARC_RADIUS){let a=coordToVec3(from.lat,from.lon,1);let b=coordToVec3(to.lat,to.lon,1);let at=Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y+a.z*b.z));let B=Math.acos(at);let al=Math.max(ab,Math.ceil((B*180)/Math.PI/ac),);let O=[];if(B<1e-9){for(let k=0;k<=1;k++)O.push({x:a.x*A,y:a.y*A,z:a.z*A});return O;}
let aj=Math.sin(B);let ad=B>Math.PI-1e-6;let R=ad?aw(a):null;for(let k=0;k<=al;k++){let t=k/al;let p;if(ad&&R){let F=B*t;p={x:a.x*Math.cos(F)+R.x*Math.sin(F),y:a.y*Math.cos(F)+R.y*Math.sin(F),z:a.z*Math.cos(F)+R.z*Math.sin(F),};}else{let Y=Math.sin((1-t)*B)/aj;let Z=Math.sin(t*B)/aj;p={x:a.x*Y+b.x*Z,y:a.y*Y+b.y*Z,z:a.z*Y+b.z*Z};}
let l=Math.hypot(p.x,p.y,p.z)||1;O.push({x:(p.x/l)*A,y:(p.y/l)*A,z:(p.z/l)*A});}
return O;}
function aw(v){let D=Math.abs(v.y)<0.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};let c={x:D.y*v.z-D.z*v.y,y:D.z*v.x-D.x*v.z,z:D.x*v.y-D.y*v.x,};let l=Math.hypot(c.x,c.y,c.z);return{x:c.x/l,y:c.y/l,z:c.z/l};}
let I=null;function aq(){if(I)return I;let c=coastline();let G=[];for(let l=0;l<c.lineStart.length;l++){let ak=c.lineStart[l];let n=c.lineCount[l];let s=[];for(let k=0;k<n;k++){s.push(coordToVec3(c.lat[ak+k],c.lon[ak+k],COASTLINE_RADIUS));}
G.push(s);}
I=G;return G;}
function ax(){I=null;}
function ap(N=128,M=72){let J=N+1;let ah=M+1;let P=new Float32Array(J*ah*3);let j=new Uint32Array(N*M*6);let p=0;for(let r=0;r<ah;r++){let au=90-(180*r)/M;for(let c=0;c<J;c++){let av=-180+(360*c)/N;let v=coordToVec3(au,av,GLOBE_RADIUS);P[p++]=v.x;P[p++]=v.y;P[p++]=v.z;}}
let i=0;for(let r=0;r<M;r++){for(let c=0;c<N;c++){let a=r*J+c;let b=a+J;j[i++]=a;j[i++]=b;j[i++]=a+1;j[i++]=a+1;j[i++]=b;j[i++]=b+1;}}
return{positions:P,indices:j};}
function an(K,A=ARC_RADIUS){let o=new Float32Array(K.length*4*S);let j=new Uint32Array(K.length*6);let ar=[[-1,-1],[1,-1],[1,1],[-1,1]];let v=0;let i=0;K.forEach((c,k)=>{let p=coordToVec3(c.lat,c.lon,A);for(let af of ar){o[v+0]=p.x;o[v+1]=p.y;o[v+2]=p.z;o[v+3]=af[0];o[v+4]=af[1];o[v+5]=k;v+=S;}
let E=k*4;j[i++]=E;j[i++]=E+1;j[i++]=E+2;j[i++]=E;j[i++]=E+2;j[i++]=E+3;});return{vertices:o,indices:j,count:K.length};}
return{ARC_MIN_SAMPLES:ab,ARC_SAMPLE_STEP_DEG:ac,MARKER_STRIDE:S,RIBBON_STRIDE:T,buildMarkers:an,buildRibbon:ao,buildSphere:ap,coastlineLines:aq,resetGeometryCache:ax,sampleGreatCircle:ay};
})();
__m["src/core/tokens.js"] = (function () {
let o=Object.freeze({surface:Object.freeze({base:'#0a0a0a',raised:'#14171a',accentFill:'#d4ff3a',}),text:Object.freeze({ink:'#e6e6e6',inkSoft:'#b9c0c7',inkFaint:'#9aa0a6',accent:'#d4ff3a',onAccent:'#0a0a0a',badgeMeasured:'#7ee0c8',badgeReported:'#8ab4f8',badgeComputed:'#b9c0c7',badgeInferred:'#f0b429',}),line:Object.freeze({coastline:'#9aa0a6',arcIdle:'#6b7178',arcActive:'#d4ff3a',rule:'#2a2e33',}),});let p=Object.freeze({surface:Object.freeze({base:'#e8ebef',raised:'#f7f8fa',accentFill:'#2d6b00',}),text:Object.freeze({ink:'#101317',inkSoft:'#41484f',inkFaint:'#454c54',accent:'#2d6b00',onAccent:'#ffffff',badgeMeasured:'#0b5d4a',badgeReported:'#0f4c96',badgeComputed:'#41484f',badgeInferred:'#7a4a00',}),line:Object.freeze({coastline:'#5a626a',arcIdle:'#7c848c',arcActive:'#2d6b00',rule:'#c6ccd3',}),});let z=Object.freeze({dark:o,light:p});let y=Object.freeze([Object.freeze({surface:'base',text:'ink'}),Object.freeze({surface:'base',text:'inkSoft'}),Object.freeze({surface:'base',text:'inkFaint'}),Object.freeze({surface:'base',text:'accent'}),Object.freeze({surface:'base',text:'badgeMeasured'}),Object.freeze({surface:'base',text:'badgeReported'}),Object.freeze({surface:'base',text:'badgeComputed'}),Object.freeze({surface:'base',text:'badgeInferred'}),Object.freeze({surface:'raised',text:'ink'}),Object.freeze({surface:'raised',text:'inkSoft'}),Object.freeze({surface:'raised',text:'inkFaint'}),Object.freeze({surface:'raised',text:'accent'}),Object.freeze({surface:'raised',text:'badgeMeasured'}),Object.freeze({surface:'raised',text:'badgeReported'}),Object.freeze({surface:'raised',text:'badgeComputed'}),Object.freeze({surface:'raised',text:'badgeInferred'}),Object.freeze({surface:'accentFill',text:'onAccent'}),]);let x=4.5;function l(q){let m=/^#([0-9a-f]{6})$/i.exec(q);if(!m)throw new TypeError('relativeLuminance: expected #rrggbb, got '+JSON.stringify(q));let v=m[1];let h=[0,2,4].map((i)=>{let s=parseInt(v.slice(i,i+2),16)/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4);});return 0.2126*h[0]+0.7152*h[1]+0.0722*h[2];}
function D(a,b){let t=l(a);let u=l(b);let E=Math.max(t,u);let F=Math.min(t,u);return(E+0.05)/(F+0.05);}
function G(n){let g=[];for(let[k,v]of Object.entries(n.surface))g.push('  --surface-'+j(k)+': '+v+';');for(let[k,v]of Object.entries(n.text))g.push('  --text-'+j(k)+': '+v+';');for(let[k,v]of Object.entries(n.line))g.push('  --line-'+j(k)+': '+v+';');return g.join('\n');}
function j(s){return s.replace(/[A-Z]/g,(c)=>'-'+c.toLowerCase());}
return{AA_NORMAL:x,DARK:o,LIGHT:p,PAIRS:y,THEMES:z,contrastRatio:D,relativeLuminance:l,themeToCssVars:G};
})();
__m["src/globe/palette.js"] = (function () {
let{THEMES,PAIRS,AA_NORMAL,contrastRatio}=__m["src/core/tokens.js"];function b(k){let m=/^#([0-9a-f]{6})$/i.exec(k);if(!m)throw new TypeError('hexToRgb: expected #rrggbb, got '+JSON.stringify(k));let v=m[1];return[parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255,];}
let e=Object.freeze({atmosphere:0.6,atmosphereLight:0.5,surfaceRim:0.85,arcIdle:0.7,arcSelected:0.9,arcWorst:1,arcWorstHalo:0.16,flow:0.5,});let f=Object.freeze({coastline:1.1,arcIdle:1.4,arcSelected:2,arcWorst:2.6,marker:3.6,markerWorst:5.4,arcWorstHalo:4,});function w(d){let a=THEMES[d];if(!a)throw new TypeError('globePalette: unknown theme '+JSON.stringify(d));let g=d==='dark';let t=g?'add':'over';return Object.freeze({themeName:d,ocean:b(a.surface.base),oceanRim:b(a.line.rule),coastline:b(a.line.coastline),arcIdle:b(a.line.arcIdle),arcSelected:b(a.text.inkSoft),arcWorst:b(a.line.arcActive),atmosphere:b(g?a.line.arcIdle:a.line.coastline),atmosphereBlend:t,atmosphereAlpha:g?e.atmosphere:e.atmosphereLight,marker:b(a.text.inkFaint),markerWorst:b(a.line.arcActive),observer:b(a.text.inkSoft),});}
function s(h,r){if(r==='worst')return{rgb:h.arcWorst,alpha:e.arcWorst,widthPx:f.arcWorst};if(r==='selected')return{rgb:h.arcSelected,alpha:e.arcSelected,widthPx:f.arcSelected};return{rgb:h.arcIdle,alpha:e.arcIdle,widthPx:f.arcIdle};}
let j=Object.freeze([Object.freeze({surface:'raised',text:'ink',where:'endpoint list item label'}),Object.freeze({surface:'raised',text:'inkSoft',where:'endpoint list secondary line'}),Object.freeze({surface:'raised',text:'inkFaint',where:'the coastline attribution line'}),Object.freeze({surface:'raised',text:'accent',where:'the worst offender list item'}),Object.freeze({surface:'base',text:'ink',where:'the no WebGL2 fallback notice'}),Object.freeze({surface:'base',text:'inkSoft',where:'the fallback map caption'}),]);function u(){let n=[];for(let c of j){let x=PAIRS.some((p)=>p.surface===c.surface&&p.text===c.text);for(let d of['dark','light']){let a=THEMES[d];let q=contrastRatio(a.text[c.text],a.surface[c.surface]);n.push({surface:c.surface,text:c.text,where:c.where,theme:d,ratio:q,pass:q>=AA_NORMAL,sanctioned:x,});}}
return n;}
return{ALPHA:e,GLOBE_TEXT_PAIRS:j,WIDTH_PX:f,arcStyle:s,globeContrastReport:u,globePalette:w,hexToRgb:b};
})();
__m["src/globe/scene.js"] = (function () {
let{assertGlobeInput,RENDER_RULES}=__m["src/core/contracts/globe.js"];let{ARC_RADIUS,cameraMatrices}=__m["src/globe/camera.js"];let{buildRibbon,buildSphere,coastlineLines,sampleGreatCircle}=__m["src/globe/geometry.js"];let{ALPHA,WIDTH_PX,arcStyle,globePalette}=__m["src/globe/palette.js"];let r=2.4;let s=0.22;let q=1.14;let j=null;let h=null;let l=new Map();function L(){j=null;h=null;l.clear();}
function F(from,p,z){let x=from.lat+','+from.lon+'>'+p.lat+','+p.lon+'@'+z;let m=l.get(x);if(!m){m=buildRibbon([sampleGreatCircle(from,p,z)]);l.set(x,m);}
return m;}
function B(){if(!j)j=buildSphere();return j;}
function u(){if(!h)h=buildRibbon(coastlineLines());return h;}
function H(J,o){let d=assertGlobeInput(J);let{camera:t,widthPx:C,heightPx:w,devicePixelRatio}=o;let M=typeof o.timeSeconds==='number'?o.timeSeconds:0;if(devicePixelRatio>d.devicePixelRatioCap){throw new RangeError('buildScene: devicePixelRatio '+devicePixelRatio+' exceeds the cap '
+'of '+d.devicePixelRatioCap+' the input declared. Fill rate over a full screen '
+'globe is what melts a phone GPU (DESIGN 6.5), and the cap is the whole defence.');}
let e=globePalette(d.theme);let K=cameraMatrices(t,C,w);let v=d.reducedMotion?0:ALPHA.flow;let I=d.reducedMotion?0:M*s;let k=[{kind:'coastline',id:'coastline',mesh:u(),rgb:e.coastline,alpha:1,widthPx:WIDTH_PX.coastline*devicePixelRatio,progress:1,flowAlpha:0,depthOrder:0,label:'Coastlines.',}];let g={idle:1,selected:2,worst:3};let A=d.arcs.slice().sort((a,b)=>g[a.state]-g[b.state]);for(let c of A){let f=arcStyle(e,c.state);let n=F(c.from,c.to,RENDER_RULES.arcRadius);if(c.state==='worst'&&d.bloomEnabled){k.push({kind:'arc',id:c.endpointId+':bloom',mesh:n,rgb:f.rgb,alpha:ALPHA.arcWorstHalo*0.5,widthPx:f.widthPx*WIDTH_PX.arcWorstHalo*2.4*devicePixelRatio,progress:c.progress,flowAlpha:0,depthOrder:g[c.state],label:c.label,});}
if(c.state==='worst'){k.push({kind:'arc',id:c.endpointId+':halo',mesh:n,rgb:f.rgb,alpha:ALPHA.arcWorstHalo,widthPx:f.widthPx*WIDTH_PX.arcWorstHalo*devicePixelRatio,progress:c.progress,flowAlpha:0,depthOrder:g[c.state],label:c.label,});}
k.push({kind:'arc',id:c.endpointId,mesh:n,rgb:f.rgb,alpha:f.alpha,widthPx:f.widthPx*devicePixelRatio,progress:c.progress,flowAlpha:c.state==='idle'?v*0.5:v,depthOrder:g[c.state],label:c.label,});}
let y=d.observer===null?[]:[{lat:d.observer.lat,lon:d.observer.lon,rgb:e.observer,alpha:1,sizePx:WIDTH_PX.marker*devicePixelRatio,label:d.observer.label,id:'observer',}];for(let c of A){let D=c.state==='worst';y.push({lat:c.to.lat,lon:c.to.lon,rgb:D?e.markerWorst:e.marker,alpha:c.state==='idle'?0.8:1,sizePx:(D?WIDTH_PX.markerWorst:WIDTH_PX.marker)*devicePixelRatio,label:c.label,id:c.endpointId,});}
return{camera:t,viewportPx:[C,w],matrices:K,palette:e,sphere:B(),atmosphereRadius:q,atmosphereAlpha:e.atmosphereAlpha,atmosphereBlend:e.atmosphereBlend,strokes:k,markers:y,reducedMotion:d.reducedMotion,bloomEnabled:d.bloomEnabled,ariaSummary:d.ariaSummary,flowPhase:I,dashCount:r,arcRadius:ARC_RADIUS,};}
return{ATMOSPHERE_RADIUS:q,DASH_COUNT:r,FLOW_CYCLES_PER_SEC:s,buildScene:H,coastlineRibbon:u,resetSceneCache:L,sphereMesh:B};
})();
__m["src/globe/pipeline.js"] = (function () {
let l=Object.freeze([Object.freeze({name:'project',glsl:'vec4 clipA = uViewProj * vec4(aPosition, 1.0);',why:'The point itself, in clip space. Everything else is relative to this.',}),Object.freeze({name:'projectTangent',glsl:'vec4 clipB = uViewProj * vec4(aPosition + aTangent, 1.0);',why:'A second point one tangent along the stroke, so the screen direction can be measured '
+'after projection rather than guessed before it.',}),Object.freeze({name:'divide',glsl:'vec2 ndcA = clipA.xy / clipA.w;\n  vec2 ndcB = clipB.xy / clipB.w;',why:'The perspective divide. A direction taken before this is the direction in the world, '
+'not the direction on the screen, and under perspective those differ.',}),Object.freeze({name:'pixelDirection',glsl:'vec2 deltaPx = (ndcB - ndcA) * uViewportPx * 0.5;\n'
+'  vec2 dirPx = length(deltaPx) > 0.0 ? normalize(deltaPx) : vec2(1.0, 0.0);',why:'Into pixels before normalising, because normalising in normalised device coordinates '
+'would make the stroke width depend on the aspect ratio. The guard is for a degenerate '
+'tangent, where normalize would return NaN and silently erase the stroke.',}),Object.freeze({name:'perpendicular',glsl:'vec2 perpPx = vec2(-dirPx.y, dirPx.x);',why:'The screen space normal of the stroke. Rotating by ninety degrees is the whole trick.',}),Object.freeze({name:'offset',glsl:'vec2 offsetNdc = perpPx * aSide * uHalfWidthPx * 2.0 / uViewportPx;',why:'Back out of pixels into normalised device coordinates. The factor of two is because '
+'that space spans -1 to 1 across the viewport, so one unit is half the viewport.',}),Object.freeze({name:'reassemble',glsl:'gl_Position = vec4((ndcA + offsetNdc) * clipA.w, clipA.z, clipA.w);',why:'Multiply back up by w so the hardware divide restores the offset position, and carry '
+'clipA.z through untouched so the depth of the ribbon is the depth of the point. This '
+'line is why the far side of the globe occludes correctly.',}),]);let A=l
.map((s)=>'  '+s.glsl)
.join('\n');function E(v,e,k,u,p,d){let b=q(v,e.x,e.y,e.z);let f=q(v,e.x+k.x,e.y+k.y,e.z+k.z);let r=b.x/b.w;let t=b.y/b.w;let H=f.x/f.w;let I=f.y/f.w;let n=(H-r)*d[0]*0.5;let o=(I-t)*d[1]*0.5;let g=Math.hypot(n,o);let C=g>0?n/g:1;let D=g>0?o/g:0;let L=-D;let M=C;let J=(L*u*p*2)/d[0];let K=(M*u*p*2)/d[1];return{x:(r+J)*b.w,y:(t+K)*b.w,z:b.z,w:b.w,};}
function q(m,x,y,z){return{x:m[0]*x+m[4]*y+m[8]*z+m[12],y:m[1]*x+m[5]*y+m[9]*z+m[13],z:m[2]*x+m[6]*y+m[10]*z+m[14],w:m[3]*x+m[7]*y+m[11]*z+m[15],};}
function B(c,d){let F=c.x/c.w;let G=c.y/c.w;return{x:(F*0.5+0.5)*d[0],y:(1-(G*0.5+0.5))*d[1],z:c.z/c.w,w:c.w,};}
return{RIBBON_EXPANSION_GLSL:A,RIBBON_EXPANSION_STEPS:l,clipToScreen:B,expandRibbonVertex:E};
})();
__m["src/globe/shaders.js"] = (function () {
let{RIBBON_EXPANSION_GLSL}=__m["src/globe/pipeline.js"];let b='#version 300 es\n';let a='#version 300 es\nprecision highp float;\n';let c=b+`
in vec3 aPosition;
uniform mat4 uViewProj;
uniform vec3 uEye;
uniform float uRadius;
out vec3 vNormal;
out vec3 vWorld;
void main() {
vec3 p = aPosition * uRadius;
vNormal = normalize(aPosition);
vWorld = p;
gl_Position = uViewProj * vec4(p, 1.0);
}
`;let j=a+`
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uOcean;
uniform vec3 uOceanRim;
uniform float uRimAlpha;
out vec4 outColor;
void main() {
vec3 view = normalize(uEye - vWorld);
float facing = clamp(dot(normalize(vNormal), view), 0.0, 1.0);
float fresnel = pow(1.0 - facing, 3.0);
outColor = vec4(mix(uOcean, uOceanRim, fresnel * uRimAlpha), 1.0);
}
`;let e=c;let d=a+`
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uAtmosphere;
uniform float uAlpha;
uniform float uRadius;
out vec4 outColor;
void main() {
// The glow is a function of how close the eye ray through this fragment passes to the centre
// of the planet, NOT of the shell's own facing angle. That distinction is the difference
// between a glow that hugs the limb and a flat grey donut: a Fresnel term on the shell peaks
// at the OUTER edge of the shell, which is the wrong edge. The impact parameter peaks at the
// planet's own silhouette, which is where an atmosphere actually is.
vec3 ray = normalize(vWorld - uEye);
float b = length(uEye - ray * dot(uEye, ray));
// INSIDE THE PLANET'S OWN SILHOUETTE THERE IS NO GLOW AT ALL, and this guard is the whole
// difference between a limb and a wash.
//
// Without it, every ray with an impact parameter under 1.0 clamps to t = 1 and gets the
// maximum glow, so the shell adds its full colour across the entire disc rather than only
// around it. Depth testing is supposed to prevent that by letting the planet occlude the far
// side of the shell, and on the machine this was measured on it did not: the planet body
// came back a flat 82, 89, 96 against the near black DESIGN 6.2 specifies for the ocean, with
// no shading variation anywhere across it. Relying on the depth buffer to enforce something
// the shader can state directly is relying on a second mechanism to fix the first one.
float inside = step(1.0, b);
float t = inside * clamp((uRadius - b) / (uRadius - 1.0), 0.0, 1.0);
float rim = pow(t, 3.0);
// Premultiplied, because the blend is ONE, ONE. Writing a straight alpha here and blending
// additively multiplies the colour in twice and blows the rim out to white, which is the one
// colour DESIGN 6.2 says the coastline may never be either.
outColor = vec4(uAtmosphere * rim * uAlpha, rim * uAlpha);
}
`;let i=b+`
in vec3 aPosition;
in vec3 aTangent;
in float aSide;
in float aArcT;
uniform mat4 uViewProj;
uniform vec2 uViewportPx;
uniform float uHalfWidthPx;
out float vSide;
out float vArcT;
void main() {
vSide = aSide;
vArcT = aArcT;
${RIBBON_EXPANSION_GLSL}
}
`;let h=a+`
in float vSide;
in float vArcT;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uProgress;
uniform float uFeather;
uniform float uFlowAlpha;
uniform float uFlowPhase;
uniform float uDashCount;
out vec4 outColor;
void main() {
// The draw in. Discarding rather than scaling the geometry keeps the arc length parameter
// meaningful and keeps one vertex buffer valid for every frame of the animation.
if (vArcT > uProgress) discard;
// Across the ribbon, vSide runs -1 to 1. Feathering the last pixel is what stops a 1.4 pixel
// stroke looking like a 1 pixel stair, and it is the reason this is worth doing at all.
float across = 1.0 - abs(vSide);
float cover = smoothstep(0.0, uFeather, across);
float travelling = pow(max(0.0, sin((vArcT * uDashCount - uFlowPhase) * 6.28318530718)), 12.0);
float a = uAlpha * cover;
float glow = travelling * uFlowAlpha * cover;
// Premultiplied again, so one blend mode (ONE, ONE_MINUS_SRC_ALPHA) serves both the stroke
// and the additive dash on top of it without a second pass.
outColor = vec4(uColor * (a + glow), a);
}
`;let g=b+`
in vec3 aCentre;
in vec2 aCorner;
uniform mat4 uViewProj;
uniform vec2 uViewportPx;
uniform float uSizePx;
out vec2 vCorner;
void main() {
vCorner = aCorner;
vec4 clip = uViewProj * vec4(aCentre, 1.0);
vec2 ndc = clip.xy / clip.w;
vec2 offsetNdc = aCorner * uSizePx * 2.0 / uViewportPx;
gl_Position = vec4((ndc + offsetNdc) * clip.w, clip.z, clip.w);
}
`;let f=a+`
in vec2 vCorner;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFeather;
out vec4 outColor;
void main() {
float r = length(vCorner);
if (r > 1.0) discard;
float cover = 1.0 - smoothstep(1.0 - uFeather, 1.0, r);
outColor = vec4(uColor * (uAlpha * cover), uAlpha * cover);
}
`;let k=Object.freeze({sphere:Object.freeze({vs:c,fs:j}),atmosphere:Object.freeze({vs:e,fs:d}),ribbon:Object.freeze({vs:i,fs:h}),marker:Object.freeze({vs:g,fs:f}),});return{ATMOSPHERE_FS:d,ATMOSPHERE_VS:e,MARKER_FS:f,MARKER_VS:g,PROGRAMS:k,RIBBON_FS:h,RIBBON_VS:i,SPHERE_FS:j,SPHERE_VS:c};
})();
__m["src/globe/renderer.js"] = (function () {
let{PROGRAMS}=__m["src/globe/shaders.js"];let{toFloat32}=__m["src/globe/mat4.js"];let{RIBBON_STRIDE,MARKER_STRIDE,buildMarkers}=__m["src/globe/geometry.js"];let t=4;function ac(Z){try{return Z.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power',desynchronized:false,});}catch{return null;}}
function P(a,an,am){let B=a.createShader(an);a.shaderSource(B,am);a.compileShader(B);if(!a.getShaderParameter(B,a.COMPILE_STATUS)){let L=a.getShaderInfoLog(B);a.deleteShader(B);throw new Error('shader compile failed: '+L);}
return B;}
function G(a,ar,ab){let Y=P(a,a.VERTEX_SHADER,ar);let Q=P(a,a.FRAGMENT_SHADER,ab);let p=a.createProgram();a.attachShader(p,Y);a.attachShader(p,Q);a.linkProgram(p);a.deleteShader(Y);a.deleteShader(Q);if(!a.getProgramParameter(p,a.LINK_STATUS)){let L=a.getProgramInfoLog(p);a.deleteProgram(p);throw new Error('program link failed: '+L);}
return p;}
function H(a,ai,ah){let V={};for(let n of ah)V[n]=a.getUniformLocation(ai,n);return V;}
function $(a){let k={sphere:G(a,PROGRAMS.sphere.vs,PROGRAMS.sphere.fs),atmosphere:G(a,PROGRAMS.atmosphere.vs,PROGRAMS.atmosphere.fs),ribbon:G(a,PROGRAMS.ribbon.vs,PROGRAMS.ribbon.fs),marker:G(a,PROGRAMS.marker.vs,PROGRAMS.marker.fs),};let u={sphere:H(a,k.sphere,['uViewProj','uEye','uRadius','uOcean','uOceanRim','uRimAlpha']),atmosphere:H(a,k.atmosphere,['uViewProj','uEye','uRadius','uAtmosphere','uAlpha']),ribbon:H(a,k.ribbon,['uViewProj','uViewportPx','uHalfWidthPx','uColor','uAlpha','uProgress','uFeather','uFlowAlpha','uFlowPhase','uDashCount']),marker:H(a,k.marker,['uViewProj','uViewportPx','uSizePx','uColor','uAlpha','uFeather']),};let T=a.getParameter(a.ALIASED_LINE_WIDTH_RANGE);let ae=T?T[1]:1;let W=new WeakMap();let C=null;let f=null;let E=[];function aq(g){if(C)return C;let q=a.createVertexArray();a.bindVertexArray(q);let r=a.createBuffer();a.bindBuffer(a.ARRAY_BUFFER,r);a.bufferData(a.ARRAY_BUFFER,g.positions,a.STATIC_DRAW);a.enableVertexAttribArray(0);a.vertexAttribPointer(0,3,a.FLOAT,false,0,0);let l=a.createBuffer();a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,l);a.bufferData(a.ELEMENT_ARRAY_BUFFER,g.indices,a.STATIC_DRAW);a.bindVertexArray(null);C={vao:q,vbo:r,ibo:l,count:g.indices.length};E.push(C);return C;}
function ap(g){let S=W.get(g);if(S)return S;let q=a.createVertexArray();a.bindVertexArray(q);let r=a.createBuffer();a.bindBuffer(a.ARRAY_BUFFER,r);a.bufferData(a.ARRAY_BUFFER,g.vertices,a.STATIC_DRAW);let s=RIBBON_STRIDE*t;a.enableVertexAttribArray(0);a.vertexAttribPointer(0,3,a.FLOAT,false,s,0);a.enableVertexAttribArray(1);a.vertexAttribPointer(1,3,a.FLOAT,false,s,3*t);a.enableVertexAttribArray(2);a.vertexAttribPointer(2,1,a.FLOAT,false,s,6*t);a.enableVertexAttribArray(3);a.vertexAttribPointer(3,1,a.FLOAT,false,s,7*t);let l=a.createBuffer();a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,l);a.bufferData(a.ELEMENT_ARRAY_BUFFER,g.indices,a.STATIC_DRAW);a.bindVertexArray(null);let e={vao:q,vbo:r,ibo:l,count:g.indices.length};W.set(g,e);E.push(e);return e;}
function ao(_,aj){let m=buildMarkers(_,aj);if(!f){let q=a.createVertexArray();a.bindVertexArray(q);let r=a.createBuffer();a.bindBuffer(a.ARRAY_BUFFER,r);let s=MARKER_STRIDE*t;a.enableVertexAttribArray(0);a.vertexAttribPointer(0,3,a.FLOAT,false,s,0);a.enableVertexAttribArray(1);a.vertexAttribPointer(1,2,a.FLOAT,false,s,3*t);let l=a.createBuffer();a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,l);a.bindVertexArray(null);f={vao:q,vbo:r,ibo:l,count:0};E.push(f);}
a.bindVertexArray(f.vao);a.bindBuffer(a.ARRAY_BUFFER,f.vbo);a.bufferData(a.ARRAY_BUFFER,m.vertices,a.DYNAMIC_DRAW);a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,f.ibo);a.bufferData(a.ELEMENT_ARRAY_BUFFER,m.indices,a.DYNAMIC_DRAW);a.bindVertexArray(null);f.count=m.indices.length;return f;}
function ak(d){let[w,h]=d.viewportPx;a.viewport(0,0,w,h);let A=d.palette;a.clearColor(A.ocean[0],A.ocean[1],A.ocean[2],1);a.clearDepth(1);a.enable(a.DEPTH_TEST);a.depthFunc(a.LEQUAL);a.depthMask(true);a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT);let I=toFloat32(d.matrices.viewProj);let v=d.matrices.eye;let M=aq(d.sphere);a.useProgram(k.sphere);a.disable(a.BLEND);a.enable(a.CULL_FACE);a.cullFace(a.BACK);a.uniformMatrix4fv(u.sphere.uViewProj,false,I);a.uniform3f(u.sphere.uEye,v.x,v.y,v.z);a.uniform1f(u.sphere.uRadius,1);a.uniform3fv(u.sphere.uOcean,A.ocean);a.uniform3fv(u.sphere.uOceanRim,A.oceanRim);a.uniform1f(u.sphere.uRimAlpha,0.85);a.bindVertexArray(M.vao);a.drawElements(a.TRIANGLES,M.count,a.UNSIGNED_INT,0);a.useProgram(k.atmosphere);a.depthMask(false);a.enable(a.BLEND);X(d.atmosphereBlend);a.cullFace(a.FRONT);a.uniformMatrix4fv(u.atmosphere.uViewProj,false,I);a.uniform3f(u.atmosphere.uEye,v.x,v.y,v.z);a.uniform1f(u.atmosphere.uRadius,d.atmosphereRadius);a.uniform3fv(u.atmosphere.uAtmosphere,A.atmosphere);a.uniform1f(u.atmosphere.uAlpha,d.atmosphereAlpha);a.drawElements(a.TRIANGLES,M.count,a.UNSIGNED_INT,0);a.useProgram(k.ribbon);a.disable(a.CULL_FACE);X('over');a.uniformMatrix4fv(u.ribbon.uViewProj,false,I);a.uniform2f(u.ribbon.uViewportPx,w,h);a.uniform1f(u.ribbon.uDashCount,d.dashCount);a.uniform1f(u.ribbon.uFlowPhase,d.flowPhase);for(let D of d.strokes){let R=D.widthPx/2;let e=ap(D.mesh);a.uniform1f(u.ribbon.uHalfWidthPx,R);a.uniform1f(u.ribbon.uFeather,Math.min(1,1/Math.max(R,0.5)));a.uniform3fv(u.ribbon.uColor,D.rgb);a.uniform1f(u.ribbon.uAlpha,D.alpha);a.uniform1f(u.ribbon.uProgress,D.progress);a.uniform1f(u.ribbon.uFlowAlpha,D.flowAlpha);a.bindVertexArray(e.vao);a.drawElements(a.TRIANGLES,e.count,a.UNSIGNED_INT,0);}
a.useProgram(k.marker);a.uniformMatrix4fv(u.marker.uViewProj,false,I);a.uniform2f(u.marker.uViewportPx,w,h);let mk=ao(d.markers,d.arcRadius);a.bindVertexArray(mk.vao);d.markers.forEach((m,i)=>{a.uniform1f(u.marker.uSizePx,m.sizePx);a.uniform3fv(u.marker.uColor,m.rgb);a.uniform1f(u.marker.uAlpha,m.alpha);a.uniform1f(u.marker.uFeather,Math.min(0.9,1.5/Math.max(m.sizePx,1)));a.drawElements(a.TRIANGLES,6,a.UNSIGNED_INT,i*6*4);});a.bindVertexArray(null);a.depthMask(true);}
function X(ag){if(ag==='add'){a.blendFunc(a.ONE,a.ONE);}else{a.blendFunc(a.ONE,a.ONE_MINUS_SRC_ALPHA);}}
function al(O,K){let c=a.canvas;if(c.width!==O)c.width=O;if(c.height!==K)c.height=K;a.viewport(0,0,O,K);}
function aa(){for(let e of E){a.deleteVertexArray(e.vao);a.deleteBuffer(e.vbo);a.deleteBuffer(e.ibo);}
E.length=0;C=null;f=null;for(let p of Object.values(k))a.deleteProgram(p);}
return{render:ak,resize:al,destroy:aa,maxLineWidth:ae};}
return{createGlobeRenderer:$,getWebGl2:ac};
})();
__m["src/globe/fallback.js"] = (function () {
let{sampleGreatCircle}=__m["src/globe/geometry.js"];let{coastline,COASTLINE_ATTRIBUTION}=__m["src/globe/coastline.js"];let{vec3ToCoord}=__m["src/globe/camera.js"];let{globePalette,ALPHA,WIDTH_PX}=__m["src/globe/palette.js"];let{assertGlobeInput}=__m["src/core/contracts/globe.js"];let L='http://www.w3.org/2000/svg';function z(I){let h=(v)=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0');return'#'+h(I[0])+h(I[1])+h(I[2]);}
function H(ad,ac,w,h){return[((ad+180)/360)*w,((90-ac)/180)*h];}
function J(t){let G=[];let A=[];for(let i=0;i<t.length;i++){if(i>0&&Math.abs(t[i].lon-t[i-1].lon)>180){if(A.length>=2)G.push(A);A=[];}
A.push(t[i]);}
if(A.length>=2)G.push(A);return G;}
function W(t,w,h){let d='';t.forEach((c,i)=>{let p=H(c.lon,c.lat,w,h);d+=(i===0?'M':'L')+p[0].toFixed(2)+' '+p[1].toFixed(2);});return d;}
function aa(ab,U={}){let o=assertGlobeInput(ab);let w=U.width||1000;let h=U.height||500;let m=globePalette(o.theme);let s=[];s.push({tag:'rect',attrs:{x:'0',y:'0',width:String(w),height:String(h),fill:z(m.ocean)},});let B=coastline();let O=[];for(let l=0;l<B.lineStart.length;l++){let X=B.lineStart[l];let n=B.lineCount[l];let R=[];for(let k=0;k<n;k++)R.push({lat:B.lat[X+k],lon:B.lon[X+k]});for(let af of J(R))O.push(W(af,w,h));}
s.push({tag:'path',attrs:{d:O.join(' '),fill:'none',stroke:z(m.coastline),'stroke-width':String(WIDTH_PX.coastline),'stroke-linejoin':'round','vector-effect':'non-scaling-stroke',},});let V={idle:1,selected:2,worst:3};let M=o.arcs.slice().sort((a,b)=>V[a.state]-V[b.state]);for(let f of M){let ah=sampleGreatCircle(f.from,f.to).map((v)=>vec3ToCoord(v));let K=f.state==='worst'
?{c:m.arcWorst,a:ALPHA.arcWorst,wpx:WIDTH_PX.arcWorst}
:f.state==='selected'
?{c:m.arcSelected,a:ALPHA.arcSelected,wpx:WIDTH_PX.arcSelected}
:{c:m.arcIdle,a:ALPHA.arcIdle,wpx:WIDTH_PX.arcIdle};let ag=J(ah).map((p)=>W(p,w,h));s.push({tag:'path',attrs:{d:ag.join(' '),fill:'none',stroke:z(K.c),'stroke-opacity':String(K.a),'stroke-width':String(K.wpx),'stroke-linecap':'round','vector-effect':'non-scaling-stroke','data-endpoint-id':f.endpointId,'data-arc-state':f.state,},children:[{tag:'title',attrs:{},text:f.label}],});}
if(o.observer!==null){let T=H(o.observer.lon,o.observer.lat,w,h);s.push({tag:'circle',attrs:{cx:T[0].toFixed(2),cy:T[1].toFixed(2),r:String(WIDTH_PX.marker),fill:z(m.observer),'data-endpoint-id':'observer',},children:[{tag:'title',attrs:{},text:o.observer.label}],});}
for(let f of M){let p=H(f.to.lon,f.to.lat,w,h);let Y=f.state==='worst';s.push({tag:'circle',attrs:{cx:p[0].toFixed(2),cy:p[1].toFixed(2),r:String(Y?WIDTH_PX.markerWorst:WIDTH_PX.marker),fill:z(Y?m.markerWorst:m.marker),'data-endpoint-id':f.endpointId,},children:[{tag:'title',attrs:{},text:f.label}],});}
return{tag:'svg',attrs:{xmlns:L,viewBox:'0 0 '+w+' '+h,width:'100%',role:'img','aria-label':o.ariaSummary,'data-globe-fallback':'svg','data-attribution':COASTLINE_ATTRIBUTION,},children:s,};}
function S(Q,C){let E=Q.createElementNS(L,C.tag);for(let[k,v]of Object.entries(C.attrs))E.setAttribute(k,v);if(typeof C.text==='string')E.textContent=C.text;for(let $ of C.children||[])E.appendChild(S(Q,$));return E;}
return{fallbackSpec:aa,mountSpec:S,rgbToHex:z,splitAtAntimeridian:J};
})();
__m["src/globe/a11y.js"] = (function () {
let{cameraKey,cameraOver}=__m["src/globe/camera.js"];let{assertGlobeInput}=__m["src/core/contracts/globe.js"];let k=Object.freeze({observer:'the observation point',idle:'measured region',selected:'selected',worst:'highlighted, the largest surplus over the floor',});function y(p){let i=assertGlobeInput(p);let D=i.observer===null?[]:[{id:'observer',coord:{lat:i.observer.lat,lon:i.observer.lon},label:i.observer.label,state:'observer',stateText:k.observer,}];for(let g of i.arcs){D.push({id:g.endpointId,coord:{lat:g.to.lat,lon:g.to.lon},label:g.label,state:g.state,stateText:k[g.state],});}
return D;}
function I(p){let h=y(p);if(h.length===0){return'A globe with coastlines drawn as thin strokes. Nothing has been measured, so no '
+'observation point is plotted and no arcs are drawn. The globe is decorative. Every '
+'value, with its provenance, is in the table.';}
let t=h.slice(1);let E=t.find((e)=>e.state==='worst');let j=[];j.push('A globe showing great circles from '+h[0].label+' to '
+z(t.length)+' cloud regions.');if(E)j.push('One is highlighted: '+E.label);j.push('The globe is decorative. Every value, with its provenance, is in the table.');return j.join(' ');}
function z(n){let S=['no','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];return S[n]||'several';}
function P(R){let w=R||(typeof globalThis!=='undefined'?globalThis:undefined);if(!w||typeof w.matchMedia!=='function')return false;try{return w.matchMedia('(prefers-reduced-motion: reduce)').matches===true;}catch{return false;}}
let F=Object.freeze([Object.freeze({keys:'Tab',does:'Move to the next endpoint. The view follows.'}),Object.freeze({keys:'Left and Right',does:'Rotate the globe west and east.'}),Object.freeze({keys:'Up and Down',does:'Rotate the globe north and south.'}),Object.freeze({keys:'Plus and Minus',does:'Zoom in and out.'}),Object.freeze({keys:'Home',does:'Reset the view.'}),Object.freeze({keys:'Enter or Space',does:'Select the focused endpoint.'}),]);function L(l,M){let q=cameraKey(l,M);if(!q)return{handled:false};return{camera:q.camera,announce:q.announce,handled:true};}
function K(l,c){return{camera:cameraOver(l,c.coord),announce:'Showing '+c.label+' '+c.stateText+'.',};}
function H(d){let b=d.createElement('p');b.setAttribute('aria-live','polite');b.setAttribute('aria-atomic','true');b.setAttribute('data-globe-live','camera');b.style.position='absolute';b.style.width='1px';b.style.height='1px';b.style.overflow='hidden';b.style.clip='rect(0 0 0 0)';b.style.clipPath='inset(50%)';b.style.whiteSpace='nowrap';return b;}
function G(d,o){let f=d.createElement('ul');f.setAttribute('data-globe-endpoints','list');f.setAttribute('aria-label','Endpoints on the globe. Focus one to bring it into view.');let m=[];function u(){for(let O of m)O();m.length=0;while(f.firstChild)f.removeChild(f.firstChild);}
function Q(h){u();for(let c of h){let x=d.createElement('li');let a=d.createElement('button');a.type='button';a.setAttribute('data-endpoint-id',c.id);a.setAttribute('data-endpoint-state',c.state);let name=d.createElement('span');name.textContent=c.label;let r=d.createElement('span');r.setAttribute('data-endpoint-state-text',c.state);r.textContent=c.stateText;a.appendChild(name);a.appendChild(r);let B=()=>o.onFocus(c);let A=()=>o.onSelect(c);let C=(v)=>{if(o.onKey(v.key))v.preventDefault();};a.addEventListener('focus',B);a.addEventListener('click',A);a.addEventListener('keydown',C);m.push(()=>{a.removeEventListener('focus',B);a.removeEventListener('click',A);a.removeEventListener('keydown',C);});x.appendChild(a);f.appendChild(x);}}
return{element:f,setEntries:Q,destroy:u};}
return{KEY_HELP:F,STATE_TEXT:k,createEndpointList:G,createLiveRegion:H,describeScene:I,focusEntry:K,handleGlobeKey:L,navEntries:y,numberFreeCount:z,prefersReducedMotion:P};
})();
__m["src/globe/replay.js"] = (function () {
let{endpointById}=__m["src/core/data/endpoints.js"];let{DEFAULT_DISTANCE}=__m["src/globe/camera.js"];let h=Object.freeze({yawDeg:-45,pitchDeg:25,distance:DEFAULT_DISTANCE,});let i=Object.freeze({widthPx:512,heightPx:512,devicePixelRatio:1});let f=Object.freeze(['aws:eu-central-1','aws:sa-east-1','aws:ap-southeast-2','aws:af-south-1','aws:ap-northeast-1',]);let g='aws:ap-northeast-1';let a=Object.freeze({lat:39.0438,lon:-77.4874,label:'Ashburn, Virginia'});function k(d={}){let n=d.theme==='light'?'light':'dark';let l=d.selectedId===undefined?'aws:eu-central-1':d.selectedId;let j=f.map((c)=>{let e=endpointById(c);if(!e){throw new Error('replayGlobeInput: '+c+' is not in the shipped endpoint table. The '
+'fixture names real rows on purpose, so a region leaving the catalogue breaks the '
+'capture rig loudly instead of drawing an invented place.');}
let m=c===g?'worst':(c===l?'selected':'idle');return{endpointId:c,from:{lat:a.lat,lon:a.lon},to:{lat:e.lat,lon:e.lon},state:m,progress:1,label:'Great circle to '+e.city+', the region '+e.providerLabel+' publishes as '
+e.providerRegionName+'.',};});return{schema:1,observer:{lat:a.lat,lon:a.lon,label:a.label},arcs:j,theme:n,reducedMotion:true,idle:false,devicePixelRatioCap:2,bloomEnabled:false,ariaSummary:'A dark globe. Great circles run from '+a.label+' to five '
+'cloud regions. The line to Tokyo is highlighted. The globe is decorative; the table '
+'below it carries every value, with its provenance.',};}
return{REPLAY_CAMERA:h,REPLAY_ENDPOINT_IDS:f,REPLAY_OBSERVER:a,REPLAY_VIEWPORT:i,REPLAY_WORST_ID:g,replayGlobeInput:k};
})();
__m["src/globe/index.js"] = (function () {
let{assertGlobeInput}=__m["src/core/contracts/globe.js"];let{buildScene}=__m["src/globe/scene.js"];let{getWebGl2,createGlobeRenderer}=__m["src/globe/renderer.js"];let{fallbackSpec,mountSpec}=__m["src/globe/fallback.js"];let{advanceIdleSpin,clampCamera,createCamera,lerpCamera}=__m["src/globe/camera.js"];let{createEndpointList,createLiveRegion,describeScene,focusEntry,handleGlobeKey,navEntries,prefersReducedMotion}=__m["src/globe/a11y.js"];let{replayGlobeInput,REPLAY_CAMERA,REPLAY_VIEWPORT}=__m["src/globe/replay.js"];let{COASTLINE_ATTRIBUTION,COASTLINE_STATS}=__m["src/globe/coastline.js"];let{globeContrastReport,GLOBE_TEXT_PAIRS}=__m["src/globe/palette.js"];let{KEY_HELP}=__m["src/globe/a11y.js"];let O=2;let R=30;let Q=1000/60;let S=0.45;let ae=`
[data-globe-root] { position: relative; display: block; }
[data-globe-root] canvas { display: block; width: 100%; height: 100%; touch-action: none; }
[data-globe-root] canvas:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
[data-globe-endpoints] { list-style: none; margin: 0; padding: 0; }
[data-globe-endpoints] button {
display: flex; gap: 0.75rem; align-items: baseline; width: 100%;
background: var(--surface-raised); color: var(--text-ink);
border: 1px solid var(--line-rule); border-radius: 2px;
padding: 0.4rem 0.6rem; font: inherit; text-align: left; cursor: pointer;
}
[data-globe-endpoints] button:focus-visible { outline: 2px solid var(--text-accent); outline-offset: 2px; }
[data-globe-endpoints] [data-endpoint-state-text] { color: var(--text-ink-soft); }
[data-globe-endpoints] [data-endpoint-state-text="worst"] { color: var(--text-accent); }
[data-globe-fallback] { display: block; width: 100%; height: auto; background: var(--surface-base); }
[data-globe-notice] { color: var(--text-ink); background: var(--surface-base); margin: 0 0 0.5rem; }
[data-globe-attribution] { color: var(--text-ink-faint); background: var(--surface-raised); }
@media (prefers-reduced-motion: reduce) {
[data-globe-root] * { animation: none !important; transition: none !important; }
}
`;let P='This browser has no WebGL2, so the globe is drawn as a flat map '
+'instead. It is the same coastline data and the same great circles. Every measured value is '
+'in the table below, which is unaffected.';let H='The browser took this page WebGL context away, which it is '
+'allowed to do at any time, so the globe is drawn as a flat map instead. It is the same '
+'coastline data and the same great circles. Every measured value is in the table below, '
+'which is unaffected.';function U(){let y=0;let B=false;return{sample(an){if(an<=Q){y+=1;if(y>=R)B=true;}else{y=0;}
return B;},get cleared(){return B;},get run(){return y;},reset(){y=0;B=false;},};}
function ah(g,D){let d=D.doc||g.ownerDocument;let j=D.win||d.defaultView;let Y=D.getInput;let ap=D.onSelect||(()=>{});g.setAttribute('data-globe-root','globe');let x=createLiveRegion(d);g.appendChild(x);let b=assertGlobeInput(Y());let f=createCamera(b.observer===null
?null
:{lat:b.observer.lat,lon:b.observer.lon});let m=null;let G=null;let N=0;let w=false;let E=false;let s=0;let o=0;let T=0;let ac=U();let c=d.createElement('canvas');c.setAttribute('role','img');c.setAttribute('aria-label',b.ariaSummary||describeScene(b));c.tabIndex=0;let k=getWebGl2(c);let ag=k?'webgl2':'svg';let i=null;let e=null;if(k){i=createGlobeRenderer(k);g.appendChild(c);}else{let q=d.createElement('p');q.setAttribute('data-globe-notice','no-webgl2');q.textContent=P;g.appendChild(q);e=mountSpec(d,fallbackSpec(b));g.appendChild(e);}
let l=createEndpointList(d,{onFocus:(K)=>{w=true;let r=focusEntry(f,K);ar(r.camera);A(r.announce);},onSelect:(K)=>ap(K.id),onKey:(ao)=>{let r=handleGlobeKey(f,ao);if(!r.handled)return false;w=true;f=r.camera;m=null;A(r.announce);u();return true;},});l.setEntries(navEntries(b));g.appendChild(l.element);let $=(W)=>{let r=handleGlobeKey(f,W.key);if(!r.handled)return;W.preventDefault();w=true;f=r.camera;m=null;A(r.announce);u();};c.addEventListener('keydown',$);let aa=(al)=>{al.preventDefault();X(H);};c.addEventListener('webglcontextlost',aa);let ab=()=>{if(d.hidden)stop();else u();};d.addEventListener('visibilitychange',ab);function A(at){x.textContent=at;}
function ar(target){if(b.reducedMotion||prefersReducedMotion(j)){f=clampCamera(target);m=null;u();return;}
m=f;G=clampCamera(target);N=0;u();}
function av(){let I=Math.min(O,b.devicePixelRatioCap,(j&&j.devicePixelRatio)||1,);let ad=c.getBoundingClientRect?c.getBoundingClientRect():{width:0,height:0};let V=Math.max(1,Math.round(ad.width||g.clientWidth||1));let ai=Math.max(1,Math.round(ad.height||g.clientHeight||V));return{widthPx:Math.round(V*I),heightPx:Math.round(ai*I),dpr:I};}
function Z(){if(b.idle)return false;if(d.hidden)return false;if(m)return true;if(b.reducedMotion)return false;if(!w)return true;return b.arcs.some((a)=>a.progress<1);}
function X(q){if(e)return;stop();if(i){try{i.destroy();}catch{}}
i=null;k=null;if(c.parentNode)c.parentNode.removeChild(c);let p=d.createElement('p');p.setAttribute('data-globe-notice','context-lost');p.textContent=q;g.insertBefore(p,l.element);e=mountSpec(d,fallbackSpec(b));g.insertBefore(e,l.element);A(q);}
function C(){if(k&&k.isContextLost&&k.isContextLost()){X(H);return;}
if(!i||!k){if(e&&e.parentNode){let _=mountSpec(d,fallbackSpec(b));e.parentNode.replaceChild(_,e);e=_;}
return;}
let v=av();i.resize(v.widthPx,v.heightPx);let aq=buildScene(b,{camera:f,widthPx:v.widthPx,heightPx:v.heightPx,devicePixelRatio:v.dpr,timeSeconds:T,});i.render(aq);}
function am(L){s=0;let J=o?Math.min(0.25,(L-o)/1000):0;if(o)ac.sample(L-o);o=L;T+=J;if(m&&G){N+=J;let t=Math.min(1,N/S);f=lerpCamera(m,G,ak(t));if(t>=1){m=null;G=null;}}else{f=advanceIdleSpin(f,J,{reducedMotion:b.reducedMotion||prefersReducedMotion(j),interacted:w,});}
C();if(Z())F();else E=false;}
function F(){if(s||!j||typeof j.requestAnimationFrame!=='function')return;E=true;s=j.requestAnimationFrame(am);}
function u(){if(b.idle||d.hidden){C();return;}
if(!E){o=0;F();}else F();}
function stop(){if(s&&j&&typeof j.cancelAnimationFrame==='function')j.cancelAnimationFrame(s);s=0;E=false;}
function au(){b=assertGlobeInput(Y());c.setAttribute('aria-label',b.ariaSummary||describeScene(b));l.setEntries(navEntries(b));if(b.idle){stop();C();return;}
u();}
function aj(){stop();c.removeEventListener('keydown',$);c.removeEventListener('webglcontextlost',aa);d.removeEventListener('visibilitychange',ab);l.destroy();if(i)i.destroy();if(c.parentNode)c.parentNode.removeChild(c);if(l.element.parentNode)l.element.parentNode.removeChild(l.element);if(x.parentNode)x.parentNode.removeChild(x);if(e&&e.parentNode)e.parentNode.removeChild(e);}
C();if(Z())F();return{update:au,destroy:aj,backend:ag,currentBackend:()=>(k&&i?'webgl2':'svg'),camera:()=>f,probe:ac,};}
function ak(t){return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}
return{COASTLINE_ATTRIBUTION,COASTLINE_STATS,CONTEXT_LOST_NOTICE:H,DEVICE_PIXEL_RATIO_CAP:O,FALLBACK_NOTICE:P,FRAME_BUDGET_MS:Q,GLOBE_CSS:ae,GLOBE_TEXT_PAIRS,KEY_HELP,PROBE_FRAMES:R,REPLAY_CAMERA,REPLAY_VIEWPORT,TWEEN_SECONDS:S,buildScene,createFrameProbe:U,createGlobe:ah,describeScene,fallbackSpec,globeContrastReport,mountSpec,navEntries,replayGlobeInput};
})();
__m["src/render/index.js"] = (function () {
let{assertGlobeInput}=__m["src/core/contracts/globe.js"];let{createGlobe,GLOBE_CSS:x,DEVICE_PIXEL_RATIO_CAP}=__m["src/globe/index.js"];let{replayGlobeInput}=__m["src/globe/replay.js"];let{prefersReducedMotion}=__m["src/globe/a11y.js"];let{GLOBE_CSS:RENDER_CSS,CONTEXT_LOST_NOTICE,FALLBACK_NOTICE}=__m["src/globe/index.js"];let{COASTLINE_ATTRIBUTION,COASTLINE_STATS}=__m["src/globe/coastline.js"];let{globeContrastReport,GLOBE_TEXT_PAIRS}=__m["src/globe/palette.js"];let{REPLAY_CAMERA,REPLAY_VIEWPORT}=__m["src/globe/replay.js"];function j(c,b){let v=c.documentElement.getAttribute('data-theme')==='light'?'light':'dark';let s=prefersReducedMotion(b);return assertGlobeInput({schema:1,observer:null,arcs:[],theme:v,reducedMotion:s,idle:false,devicePixelRatioCap:Math.min(DEVICE_PIXEL_RATIO_CAP,(b&&b.devicePixelRatio>0)?b.devicePixelRatio:DEVICE_PIXEL_RATIO_CAP,),bloomEnabled:false,ariaSummary:'A dark globe with coastlines drawn as thin strokes. No measurement has been '
+'taken, so no arcs are drawn. This image is decorative and the result is the table '
+'below it.',});}
let a=null;let e=null;let g=null;let f=false;function p(d){if(!d||typeof d.appendChild!=='function'){throw new TypeError('render.mount: expected an element to mount into');}
let c=d.ownerDocument;let b=c.defaultView;let u=b&&b.location?b.location.search:'';f=new URLSearchParams(u||'').get('replay')==='1';let t=f;e=t
?assertGlobeInput(replayGlobeInput({theme:c.documentElement.getAttribute('data-theme')==='light'?'light':'dark',}))
:j(c,b);a=createGlobe(d,{getInput:()=>e,onSelect:(m)=>{if(g)g(m);},doc:c,win:b,});return{backend:a.backend};}
function w(o){let q=assertGlobeInput(o);if(f)return;e=q;if(a)a.update();}
function r(i){g=typeof i==='function'?i:null;}
function h(){return a?a.backend:null;}
function k(){return a&&a.currentBackend?a.currentBackend():h();}
function n(){return a?a.probe:null;}
function l(){if(a)a.destroy();a=null;e=null;g=null;f=false;}
return{COASTLINE_ATTRIBUTION,COASTLINE_STATS,CONTEXT_LOST_NOTICE,FALLBACK_NOTICE,GLOBE_TEXT_PAIRS,RENDER_CSS,REPLAY_CAMERA,REPLAY_VIEWPORT,backend:h,currentBackend:k,destroy:l,frameProbe:n,globeContrastReport,idleGlobeInput:j,mount:p,onSelect:r,replayGlobeInput,update:w};
})();

__m["src/ui/adapters.js"].wireRenderer(__m["src/render/index.js"]);
})();
