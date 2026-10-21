/* Archive ZIP minimale (fichiers stockés sans compression), suffisante pour
   le paquet d'annonces : quelques fichiers texte de petite taille. */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Heure et date au format DOS. */
function dos(d: Date) {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function creerZip(fichiers: { nom: string; data: Uint8Array }[], quand = new Date()): Blob {
  const { heure, date } = dos(quand);
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of fichiers) {
    const nom = new TextEncoder().encode(f.nom);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(10, heure, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, nom.length, true);
    morceaux.push(new Uint8Array(local.buffer), nom, f.data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nom);
    offset += 30 + nom.length + f.data.length;
  }
  const tailleCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, offset, true);
  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)] as BlobPart[], { type: "application/zip" });
}
