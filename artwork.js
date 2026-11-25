(() => {
  "use strict";
  const defaults = Object.freeze({
    yearSet: "Fold Studies", title: "Helix Fold", cardNumber: "F-14",
    variation: "Ultramarine", gradeText: "Proof", grade: "A", serial: "FS14027"
  });
  const ink = "#13252f", blue = "#3256ce", saffron = "#f5b653", paper = "#f6f0e3";
  let frontPaper, backPaper, sampleCards;

  function surface(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = 2 * width;
    canvas.height = 2 * height;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.imageSmoothingQuality = "high";
    return canvas;
  }

  function polygon(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  }

  function rule(ctx, x, y, x2, y2, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function type(ctx, text, x, y, font, color, align = "left", width) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    if (width === undefined) ctx.fillText(text, x, y);
    else ctx.fillText(text, x, y, width);
  }

  function foldMark(ctx, cx, cy, scale, color) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
    polygon(ctx, [[-32,24],[-32,-8],[-8,-32],[-8,0]], color);
    polygon(ctx, [[0,32],[0,0],[24,-24],[24,8]], color);
    ctx.restore();
  }

  // The insert's metalized dies are registered to these two polygons in the 3D model.
  function foil(ctx, rear) {
    ctx.save();
    if (rear) {
      ctx.beginPath(); ctx.moveTo(614,0); ctx.lineTo(922,0); ctx.lineTo(922,210);
      ctx.lineTo(768,261); ctx.lineTo(614,210); ctx.closePath();
    } else {
      ctx.beginPath(); ctx.rect(670,316,204,132);
    }
    ctx.clip();
    const x = rear ? 614 : 670, y = rear ? 0 : 316;
    const w = rear ? 308 : 204, h = rear ? 261 : 132;
    const foilInk = ctx.createLinearGradient(x,y,x+w,y+h);
    foilInk.addColorStop(0, "#9caab1");
    foilInk.addColorStop(.32, "#f3ebce");
    foilInk.addColorStop(.56, "#bbd3d7");
    foilInk.addColorStop(1, "#c6bcae");
    ctx.fillStyle = foilInk; ctx.fillRect(x,y,w,h);
    for (let offset = -h; offset < w; offset += 8) {
      rule(ctx,x+offset,y,x+offset+h,y+h,"rgba(255,255,255,.45)");
    }
    foldMark(ctx,x+w/2,y+h*(rear ? .44 : .5),rear ? 2 : 1.25,ink);
    ctx.restore();
  }

  function paperFace(rear) {
    if (rear ? backPaper : frontPaper) return rear ? backPaper : frontPaper;
    const canvas = surface(1536,448), ctx = canvas.getContext("2d");
    ctx.fillStyle = rear ? ink : paper;
    ctx.fillRect(0,0,1536,448);
    if (rear) {
      type(ctx,"FOLD",56,180,"bold 112px Helvetica, Arial, sans-serif",paper);
      type(ctx,"STUDIES",56,280,"112px Helvetica, Arial, sans-serif",paper);
      ctx.fillStyle = paper; ctx.fillRect(0,352,1536,96);
      backPaper = canvas;
    } else {
      ctx.fillStyle = blue; ctx.fillRect(0,0,1536,24);
      ctx.fillRect(0,424,1536,24);
      ctx.fillStyle = "#e4dfd3"; ctx.fillRect(0,304,1536,8);
      ctx.fillStyle = saffron; ctx.fillRect(0,24,24,400);
      frontPaper = canvas;
    }
    foil(ctx,rear);
    return canvas;
  }

  // Code 128 element widths in symbol order, including the seven-element stop symbol.
  const code128 = (
    "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 " +
    "112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 " +
    "311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 " +
    "112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
    "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
    "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 " +
    "122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 " +
    "124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
    "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
  ).split(" ");

  function barcode(ctx, serial, x, y, width, height) {
    if (!serial || !/^[ -~]+$/.test(serial)) return;
    const pairs = /^(?:[0-9]{2})+$/.test(serial);
    const start = pairs ? 105 : 104;
    const symbols = pairs ? serial.match(/../g).map(Number) : Array.from(serial, c => c.charCodeAt(0) - 32);
    const checksum = symbols.reduce((sum, symbol, i) => sum + symbol * (i+1), start) % 103;
    const runs = [start, ...symbols, checksum, 106].map(v => code128[v]).join("");
    const modules = [...runs].reduce((sum, digit) => sum + Number(digit), 0);
    let before = 0;
    ctx.fillStyle = "#15151a";
    for (let i = 0; i < runs.length; i++) {
      const after = before + Number(runs[i]);
      if (i % 2 === 0) {
        const left = Math.round(x + width * before / modules);
        const right = Math.round(x + width * after / modules);
        ctx.fillRect(left, y, right-left, height);
      }
      before = after;
    }
  }

  function drawQR(ctx, qrSource) {
    if (qrSource) {
      const x = 1105, y = 42, size = 292, pad = 29;
      const sw = qrSource.naturalWidth || qrSource.width;
      const sh = qrSource.naturalHeight || qrSource.height;
      if (sw > 0 && sh > 0) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, 16);
        ctx.fill();
        const factor = (size - 2*pad) / Math.max(sw, sh);
        const w = Math.round(sw * factor), h = Math.round(sh * factor);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qrSource, Math.round(x + (size-w)/2), Math.round(y + (size-h)/2), w, h);
        ctx.imageSmoothingEnabled = true;
      }
    }
  }

  function label(data = defaults, rear = false, qrSource = null) {
    const values = Object.fromEntries(Object.keys(defaults).map(key =>
      [key, String(data[key] ?? defaults[key]).trim()]));
    const canvas = surface(1536,448), ctx = canvas.getContext("2d");
    ctx.drawImage(paperFace(rear),0,0,1536,448);
    const sans = "px Helvetica, Arial, sans-serif", mono = "px Menlo, monospace";
    if (rear) {
      drawQR(ctx,qrSource);
      barcode(ctx,values.serial,72,368,408,64);
      type(ctx,values.serial,1464,422,"52"+mono,ink,"right",848);
    } else {
      type(ctx,values.yearSet.toUpperCase(),56,98,"48"+sans,ink,"left",1000);
      type(ctx,values.cardNumber,1480,98,"48"+mono,ink,"right",328);
      type(ctx,values.title,56,194,"bold 84"+sans,ink,"left",960);
      type(ctx,values.variation,56,278,"56"+sans,ink,"left",960);
      type(ctx,values.gradeText.toUpperCase(),1480,178,"48"+sans,ink,"right",392);
      type(ctx,values.grade,1480,278,"bold 92"+sans,ink,"right",392);
      barcode(ctx,values.serial,72,328,416,72);
      type(ctx,values.serial,1480,390,"48"+mono,ink,"right",552);
    }
    return canvas;
  }

  // Project an independently drawn, closed, half-twisted ribbon onto the print.
  // Sort the little facets back-to-front to keep the crossing visibly woven.
  function ribbon(ctx,cx,cy,scale,wire) {
    function vertex(angle, cross) {
      const radius = 185 + cross*68*Math.cos(1.5*angle+.4);
      const x = radius*Math.cos(angle), y = radius*Math.sin(angle);
      const z = cross*68*Math.sin(1.5*angle+.4) + 52*Math.sin(2*angle);
      const v = .71*y-.70*z, depth = .70*y+.71*z;
      return {xy:[cx+scale*(.96*x+.28*v),cy+scale*(-.28*x+.96*v)],depth};
    }
    const count = 120, bands = 8, facets = [];
    for(let j=0;j<bands;j++) {
      const u = 2*j/bands-1, v = 2*(j+1)/bands-1;
      for(let i=0;i<count;i++) {
        const a = i*2*Math.PI/count, b = (i+1)*2*Math.PI/count;
        const points = [vertex(a,u),vertex(b,u),vertex(b,v),vertex(a,v)];
        const depth = points.reduce((sum,p) => sum+p.depth,0)/4;
        facets.push({points:points.map(p => p.xy),depth,a,u});
      }
    }
    facets.sort((a,b) => a.depth-b.depth);
    for(const f of facets) {
      const tone = .5+.5*Math.cos(f.a*1.5+.48);
      const color = wire ? ink : 'hsl('+(224+tone*9)+' 58% '+(28+tone*28+f.u*4)+'%)';
      polygon(ctx,f.points,color);
      const [p,q,r] = f.points;
      rule(ctx,...p,...q,wire ? "#6b9198" : "rgba(243,238,212,.70)",wire ? 1.5 : 1.8);
      rule(ctx,...q,...r,wire ? "#55727c" : color,wire ? .8 : 1.2);
    }
  }

  function cardFace(rear) {
    const canvas = surface(760,1064), ctx = canvas.getContext("2d");
    const ground = rear ? ink : paper, textColor = rear ? paper : ink;
    ctx.fillStyle = ground; ctx.fillRect(0,0,760,1064);
    foldMark(ctx,68,72,.9,rear ? saffron : blue);
    type(ctx,"FOLD STUDIES",120,84,"bold 28px Helvetica, Arial, sans-serif",textColor);
    type(ctx,"F–14",704,84,"24px Menlo, monospace",textColor,"right");
    rule(ctx,48,112,712,112,rear ? "#536472" : "#b5b5a9",2);
    if(rear) {
      ctx.save(); ctx.translate(0,24);
      for (let i=0;i<12;i++) rule(ctx,56,224+i*40,704,224+i*40,"#243845");
      for (let i=0;i<17;i++) rule(ctx,56+i*40,224,56+i*40,664,"#243845");
      ribbon(ctx,380,448,1.08,true);
      ctx.restore();
      type(ctx,"Form study 14",56,808,"64px Georgia, serif",paper);
      type(ctx,"Half-twist in a closed loop",56,864,"32px Helvetica, Arial, sans-serif","#b1c7c7");
      rule(ctx,56,944,704,944,"#536472",2);
      type(ctx,"FOLD SERIES",56,1008,"20px Menlo, monospace",paper);
      type(ctx,"F–14",704,1008,"20px Menlo, monospace",paper,"right");
    } else {
      ctx.fillStyle = saffron; ctx.fillRect(48,152,664,584);
      ribbon(ctx,380,444,1.32,false);
      type(ctx,"Helix Fold",48,864,"bold 96px Georgia, serif",ink,"left",664);
      rule(ctx,48,912,712,912,"#b5b5a9",2);
      type(ctx,"ULTRAMARINE",48,992,"24px Menlo, monospace",blue);
      type(ctx,"FOLD SERIES",712,992,"24px Menlo, monospace",ink,"right");
    }
    return canvas;
  }

  async function sample() {
    if (!sampleCards) sampleCards = {front:cardFace(false),back:cardFace(true)};
    return sampleCards;
  }
  window.SlabArt = Object.freeze({defaults, sample, label});
})();
