import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent((req.url||"/").split("?")[0]);
 const file=path.join(root,rel==="/"?"index.html":rel.slice(1));
 if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end("not found");}
 const ext=path.extname(file); const type=ext===".html"?"text/html":ext===".js"?"text/javascript":"text/css";
 res.writeHead(200,{"content-type":type}); res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(4173,"127.0.0.1",r));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
try{
 await page.goto("http://127.0.0.1:4173/",{waitUntil:"networkidle"});
 await page.waitForTimeout(4000);
 if(!(await page.locator("canvas").boundingBox()))throw new Error("canvas did not render");
 const state=await page.evaluate(()=>window.__trafficFlowDebug?.());
 if(!state||state.cars<1||state.lights.length<1)throw new Error("simulation did not initialize");
 const before=state.edges,n=state.nodes;
 await page.getByTitle("修路").click();
 await page.mouse.move(n[0].x,n[0].y); await page.mouse.down();
 await page.mouse.move(n[4].x,n[4].y); await page.mouse.up();
 const after=await page.evaluate(()=>window.__trafficFlowDebug().edges);
 if(after<=before)throw new Error("road tool did not create a road");
 await page.getByTitle("驾驶").click(); await page.waitForTimeout(2500);
 const moving=await page.evaluate(()=>window.__trafficFlowDebug());
 if(moving.cars<1)throw new Error("traffic disappeared unexpectedly");
 if(errors.length)throw new Error("browser errors: "+errors.join(" | "));
 await page.screenshot({path:"test-results/traffic-flow.png"});
 console.log("Browser test passed",moving);
}finally{await browser.close();server.close();}