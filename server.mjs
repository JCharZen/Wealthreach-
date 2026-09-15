import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const ROOT = new URL("./", import.meta.url);
const categories = [
  ["Real estate", ["mansion","estate","property","home","house","penthouse","mortgage","deed","permit"]],
  ["Vehicles & luxury assets", ["yacht","jet","aircraft","helicopter","car","supercar","vehicle","watch","jewelry","art","auction","collector"]],
  ["Liquidity & equity", ["shares","stock","ipo","secondary sale","dividend","acquisition","exit","stake","valuation"]],
  ["Philanthropy & sponsorship", ["donation","donated","pledge","sponsor","gala","foundation","naming rights"]],
  ["Compensation", ["compensation","salary","bonus","pay package","severance","stock award"]],
  ["Liabilities & legal", ["lawsuit","divorce","lien","debt","mortgage","bankruptcy","judgment"]]
];

const xmlText = value => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const tag = (xml, name) => xmlText(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");

function classify(text) {
  const lower = text.toLowerCase();
  const ranked = categories.map(([name, terms]) => [name, terms.filter(t => lower.includes(t)).length]).sort((a,b)=>b[1]-a[1]);
  return ranked[0][1] ? ranked[0][0] : "General wealth indicator";
}

function assess(item, subject) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const identityHits = [subject.name, subject.company, subject.title].filter(Boolean).filter(v => text.includes(v.toLowerCase())).length;
  const amount = /(?:\$|usd\s?)\d[\d,.]*(?:\s?(?:million|billion|m|bn))?/i.test(text);
  const location = /\b(home|house|estate|property|mansion|penthouse|marina|airport|address)\b/i.test(text);
  const routine = /\b(vacation|travel|attend|gala|auction|club|marina|resort)\b/i.test(text);
  const direct = /\b(bought|purchased|acquired|owns|owner|paid|sold|donated|pledged|earned)\b/i.test(text);
  const confidenceScore = identityHits * 22 + (amount ? 18 : 0) + (direct ? 15 : 0) + (item.source ? 8 : 0);
  const epScore = (location ? 35 : 0) + (routine ? 25 : 0) + (amount ? 20 : 0) + (direct ? 10 : 0);
  return {
    ...item,
    category: classify(text),
    confidence: confidenceScore >= 65 ? "High" : confidenceScore >= 38 ? "Medium" : "Low",
    relevance: epScore >= 55 ? "High" : epScore >= 25 ? "Medium" : "Low",
    confidenceScore: Math.min(confidenceScore, 100),
    epScore: Math.min(epScore, 100),
    indicators: [amount&&"Public value", location&&"Location exposure", routine&&"Routine/event", direct&&"Direct attribution"].filter(Boolean)
  };
}

function buildQueries({name, company, title}) {
  const identity = [name && `"${name}"`, company && `"${company}"`, title && `"${title}"`].filter(Boolean).join(" ");
  return [
    `${identity} (purchased OR bought OR acquired OR owns OR sold)`,
    `${identity} (mansion OR property OR yacht OR jet OR auction OR collector)`,
    `${identity} (donation OR pledge OR sponsor OR gala OR foundation)`,
    `${identity} (shares OR stock OR compensation OR IPO OR dividend OR acquisition)`,
    `${identity} (lawsuit OR divorce OR lien OR debt OR mortgage)`
  ];
}

async function fetchRss(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, {headers: {"user-agent":"WealthExposureMonitor/1.0"}});
  if (!response.ok) throw new Error(`News source returned ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const block = match[1];
    return {
      title: tag(block, "title").replace(/\s+-\s+[^-]+$/, ""),
      link: tag(block, "link"),
      description: tag(block, "description"),
      publishedAt: tag(block, "pubDate"),
      source: tag(block, "source") || tag(block, "title").split(" - ").pop()
    };
  });
}

async function search(subject) {
  const queries = buildQueries(subject);
  const settled = await Promise.allSettled(queries.map(fetchRss));
  const seen = new Set();
  const results = settled.flatMap(x => x.status === "fulfilled" ? x.value : [])
    .filter(x => { const key=x.title.toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true; })
    .map(x => assess(x, subject))
    .sort((a,b) => (b.confidenceScore+b.epScore)-(a.confidenceScore+a.epScore))
    .slice(0, 75);
  return {subject, queries, results, searchedAt:new Date().toISOString(), sourceStatus:settled.map((x,i)=>({query:queries[i],ok:x.status==="fulfilled"}))};
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==="/api/search"){
      const subject={name:url.searchParams.get("name")?.trim(),company:url.searchParams.get("company")?.trim(),title:url.searchParams.get("title")?.trim()};
      if(!subject.name) return void(res.writeHead(400,{"content-type":"application/json"}).end(JSON.stringify({error:"A person’s name is required."})));
      const payload=await search(subject); res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"}); return void res.end(JSON.stringify(payload));
    }
    const requested=url.pathname==="/"?"index.html":url.pathname.slice(1);
    if (!["index.html","app.js","styles.css"].includes(requested)) {
      res.writeHead(404,{"content-type":"application/json"});
      return void res.end(JSON.stringify({error:"Not found"}));
    }
    const safe=normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    const body=await readFile(new URL(safe,ROOT)); res.writeHead(200,{"content-type":mime[extname(safe)]||"application/octet-stream"}); res.end(body);
  }catch(error){res.writeHead(error.code==="ENOENT"?404:500,{"content-type":"application/json"});res.end(JSON.stringify({error:error.code==="ENOENT"?"Not found":"Search failed. Try again shortly."}));}
});
if (process.argv[1] && normalize(fileURLToPath(import.meta.url)) === normalize(process.argv[1])) {
  server.listen(PORT,()=>console.log(`Wealth Exposure Monitor running at http://localhost:${PORT}`));
}
export { buildQueries, classify, assess };
