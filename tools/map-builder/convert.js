// Openpiece world-map converter: reads the painted PNG, classifies each pixel's
// colour into a terrain, votes per output cell, downsamples to a chunk grid, and
// writes a tool-loadable map JSON. Pure Node (built-in zlib); source is 8-bit RGB.
//   node convert.js            → convert to one_piece_map.json (+ ASCII preview)
//   node convert.js --inspect  → dump the source palette instead
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SRC = path.join(__dirname, 'image', 'one_piece_pixel_map.png');
const OUT_JSON = path.join(__dirname, 'one_piece_map.json');
const OUT_SIZE = 256; // target grid is 256 x 256 chunks

// Terrain indices MUST match the tool's TERRAINS array order (index.html).
const T = { deepSea:0, sea:1, shallowSea:2, beach:3, land:4, hill:5, mountain:6,
            peak:7, grandLine:8, calmBelt:9, redLine:10, reverseMountain:11, thinPlace:12 };
const TERRAINS = [
  { id:'deepSea', name:'Deep Sea', color:'#0a2036' }, { id:'sea', name:'Sea', color:'#123f6b' },
  { id:'shallowSea', name:'Shallow Sea', color:'#2f7fb5' }, { id:'beach', name:'Beach', color:'#d9c48c' },
  { id:'land', name:'Land', color:'#4f9a4f' }, { id:'hill', name:'Hill', color:'#6f8a3c' },
  { id:'mountain', name:'Mountain', color:'#7d7166' }, { id:'peak', name:'Peak', color:'#e7edf1' },
  { id:'grandLine', name:'Grand Line', color:'#1c6e8c' }, { id:'calmBelt', name:'Calm Belt', color:'#4a6b63' },
  { id:'redLine', name:'Red Line', color:'#8a3b2e' }, { id:'reverseMountain', name:'Reverse Mountain', color:'#a86b5c' },
  { id:'thinPlace', name:'Thin Place', color:'#9aa0b8' },
];

// ---- Classify one source pixel into a terrain index (tuned to THIS image's palette) ----
// Discriminators from the histogram: sea = very low red; red line = red-dominant with
// low blue (r-b large); beach = light with HIGH blue; calm belt = teal-grey (moderate
// red, green≈blue, both high); land = green with low blue.
function classify(r, g, b){
  if (r < 40 && b > 110 && b >= g) return T.sea;              // blue open water
  if (r > 150 && (r - b) > 60 && r >= g) return T.redLine;    // tan/gold continent spine
  if (r > 160 && g > 150 && b > 120) return T.beach;          // pale cream islands
  if (r >= 40 && g >= 105 && b >= 95 && g >= b - 10) return T.calmBelt; // teal-grey band
  if (g >= r && g > b && b < 95) return g >= 105 ? T.land : T.hill;     // green island
  if (Math.max(r, g, b) < 80) return T.mountain;             // dark rock / the central hub
  return T.sea;                                              // fallback
}

// ---- Minimal PNG decoder (colorType 2 / RGB / 8-bit / no interlace) ----
function paeth(a, b, c){
  const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}
function decodePNG(buf){
  let pos = 8, w = 0, h = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length){
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos+4, pos+8);
    const data = buf.slice(pos+8, pos+8+len);
    if (type === 'IHDR'){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (colorType !== 2) throw new Error('expected RGB (colorType 2), got ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 3, stride = w * bpp, out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), rp = 0;
  for (let y = 0; y < h; y++){
    const filter = raw[rp++];
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++){
      const v = raw[rp + x];
      const a = x >= bpp ? cur[x-bpp] : 0, up = prev[x], ul = x >= bpp ? prev[x-bpp] : 0;
      let val;
      switch (filter){
        case 1: val = v + a; break;
        case 2: val = v + up; break;
        case 3: val = v + ((a + up) >> 1); break;
        case 4: val = v + paeth(a, up, ul); break;
        default: val = v;
      }
      cur[x] = val & 255;
    }
    rp += stride;
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, data: out };
}

const img = decodePNG(fs.readFileSync(SRC));
const hex = (r,g,b) => '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');

// ---- Inspect mode ----
if (process.argv.includes('--inspect')){
  const counts = new Map();
  for (let i = 0; i < img.data.length; i += 3){
    const key = (img.data[i] & 0xF0) << 16 | (img.data[i+1] & 0xF0) << 8 | (img.data[i+2] & 0xF0);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = img.w * img.h;
  console.log('image', img.w + 'x' + img.h, ' total px', total);
  for (const [k, n] of [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 26))
    console.log(hex((k>>16)&255, (k>>8)&255, k&255), (100*n/total).toFixed(1) + '%');
  process.exit(0);
}

// ---- Convert: vote each output cell from its source block ----
const { w: W, h: H, data } = img;
const cells = new Int16Array(OUT_SIZE * OUT_SIZE);
const votes = new Int32Array(TERRAINS.length);
for (let oy = 0; oy < OUT_SIZE; oy++){
  const y0 = Math.floor(oy * H / OUT_SIZE), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * H / OUT_SIZE));
  for (let ox = 0; ox < OUT_SIZE; ox++){
    const x0 = Math.floor(ox * W / OUT_SIZE), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * W / OUT_SIZE));
    votes.fill(0);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++){
        const i = (y * W + x) * 3;
        votes[classify(data[i], data[i+1], data[i+2])]++;
      }
    let best = -1, bi = T.sea;
    for (let t = 0; t < votes.length; t++) if (votes[t] > best){ best = votes[t]; bi = t; }
    cells[oy * OUT_SIZE + ox] = bi;
  }
}

// ---- Write the tool-loadable map ----
fs.writeFileSync(OUT_JSON, JSON.stringify({
  format: 'openpiece-worldmap', version: 1,
  width: OUT_SIZE, height: OUT_SIZE, chunkTiles: 64,
  terrains: TERRAINS.map(t => ({ id:t.id, name:t.name, color:t.color })),
  cells: Array.from(cells),
}));

// ---- Report: terrain tally + ASCII preview ----
const tally = new Int32Array(TERRAINS.length);
for (const v of cells) tally[v]++;
console.log('wrote', path.basename(OUT_JSON), '(' + OUT_SIZE + 'x' + OUT_SIZE + ' chunks)\n');
TERRAINS.forEach((t, i) => { if (tally[i]) console.log('  ' + t.name.padEnd(16), (100*tally[i]/cells.length).toFixed(1) + '%'); });

const CH = { [T.sea]:' ', [T.deepSea]:'.', [T.shallowSea]:'-', [T.beach]:':', [T.land]:'#',
             [T.hill]:'%', [T.mountain]:'M', [T.peak]:'^', [T.calmBelt]:'~', [T.redLine]:'|',
             [T.grandLine]:'=', [T.reverseMountain]:'A', [T.thinPlace]:'F' };
console.log('\nASCII preview (downsampled):');
const COLS = 96, ROWS = 44;
for (let r = 0; r < ROWS; r++){
  let line = '';
  for (let c = 0; c < COLS; c++){
    const ox = Math.floor(c * OUT_SIZE / COLS), oy = Math.floor(r * OUT_SIZE / ROWS);
    line += CH[cells[oy * OUT_SIZE + ox]] || '?';
  }
  console.log(line);
}
