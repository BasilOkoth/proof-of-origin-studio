import { analyzeCsv } from './src/lib/data-story';
const text = `site,year,value,latitude,longitude\nNairobi,2022,42,-1.2864,36.8172\nNairobi,2023,48,-1.2864,36.8172\nAccra,2024,55,5.6037,-0.1870\nLagos,2025,68,6.5244,3.3792\nKampala,2026,73,0.3476,32.5825`;
const result = analyzeCsv(text,'africa_sites.csv');
console.log(JSON.stringify({rowCount:result.rowCount, chart:result.recommendedChart?.type, mapPoints:result.recommendedMap?.points.length, focus:result.recommendedMap?.focus, insight:result.insight}, null, 2));
