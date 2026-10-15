"use client";

/* ============================================================
   Plan de situation (avis de valeur, page « Le bien ») : tuiles
   Plan IGN (Géoplateforme, sans clé) centrées sur l'adresse, avec
   le repère PATRIM au centre. Simples images : elles s'impriment
   comme le reste de la page.
   ============================================================ */

const TILE = 256;

/** Coordonnées de tuile (fractionnaires) d'un point au niveau de zoom `z` */
function tileXY(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

const ignTile = (z: number, x: number, y: number) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/png`;

export function SituationMap({ lat, lon, zoom = 16, color = "#8a0e01" }: { lat: number; lon: number; zoom?: number; color?: string }) {
  // Niveau +1 affiché à demi-taille : net à l'impression
  const z = zoom + 1;
  const size = TILE / 2;
  const { x, y } = tileXY(lat, lon, z);
  const tiles: { tx: number; ty: number }[] = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) tiles.push({ tx: Math.floor(x) + dx, ty: Math.floor(y) + dy });

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f2f1ed]" style={{ overflow: "clip", contain: "strict" }}>
      {tiles.map(({ tx, ty }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${tx}-${ty}`}
          alt=""
          draggable={false}
          src={ignTile(z, tx, ty)}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
          className="absolute max-w-none select-none"
          style={{ width: size, height: size, left: `calc(50% + ${(tx - x) * size}px)`, top: `calc(50% + ${(ty - y) * size}px)` }}
        />
      ))}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-1/2 top-1/2 h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, opacity: 0.12 }} />
        <span className="absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, opacity: 0.18 }} />
        <span className="relative block h-[18px] w-[18px] rounded-full border-[3px] border-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]" style={{ backgroundColor: color }} />
      </div>
      <span className="absolute bottom-1.5 right-2 rounded bg-white/80 px-1.5 py-0.5 text-[6.5px] text-[#5f6368]">© IGN – Plan IGN</span>
    </div>
  );
}
