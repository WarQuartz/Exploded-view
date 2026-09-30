import scenarios from "./scenarios.json";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/rooms")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "POST" && parts.length === 2) {
    const body = await request.json().catch(() => ({}));
    for (let tries=0; tries<5; tries++) {
      const code = makeCode();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const response = await stub.fetch(new Request(new URL("/create", url.origin), {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code,name:body.name,deck:body.deck,mode:body.mode,stats:body.stats===true})
      }));
      if (response.status !== 409) return response;
    }
    return json({error:"ROOM_CODE_COLLISION"},503);
  }
  if (parts.length < 3) return json({error:"NOT_FOUND"},404);
  const code=parts[2].toUpperCase(), action=parts[3]||"";
  const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
  const target=new URL("/"+action,url.origin); target.search=url.search;
  return stub.fetch(new Request(target,request));
}

function makeCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789", bytes=crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes,b=>chars[b%chars.length]).join("");
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
function token(){return crypto.randomUUID().replaceAll("-","")}

export class Room {
  constructor(state,env){this.state=state;this.env=env}
  load(){return this.state.storage.get("room")}
  async save(room){room.updatedAt=Date.now();await this.state.storage.put("room",room)}
  scenario(room){return scenarios.find(s=>s.id===room.scenarioId)}
  pick(deck,mode="ALL",exclude=null){
    const modeMatch=s=>{const m=(s.mode||"").toLowerCase();if(mode==="ALL")return true;if(mode==="Friends")return m.includes("friend");if(mode==="Dating / Couples")return m.includes("dating")||m.includes("couple")||m==="two-player";if(mode==="Family")return m.includes("family");if(mode==="Coworkers")return m.includes("cowork")||m.includes("work friend");if(mode==="New People / Anybody")return m.includes("new people")||m.includes("anybody");if(mode==="Solo")return m.includes("solo");return true};
    let pool=scenarios.filter(s=>(deck==="ALL"||s.category===deck)&&modeMatch(s));
    if(!pool.length)pool=scenarios.filter(modeMatch);
    if(exclude&&pool.length>1)pool=pool.filter(s=>s.id!==exclude);
    return pool[Math.floor(Math.random()*pool.length)];
  }
  playerIndex(room,t){return room.players.findIndex(p=>p?.token===t)}
  both(room,f){return room.players.length===2&&room.players.every(p=>p&&p[f]!==null&&p[f]!==undefined)}
  count(room,s,stage,answer){
    if(!room.stats||!this.env.ANALYTICS)return;
    this.env.ANALYTICS.writeDataPoint({indexes:[s.id],blobs:[s.id,s.category||"",s.mode||"",s.angle||"",stage,answer],doubles:[1]});
  }
  view(room,t){
    const me=this.playerIndex(room,t);if(me<0)return null;
    const s=this.scenario(room),reveal=room.phase==="reveal";
    return {code:room.code,phase:room.phase,deck:room.deck,mode:room.mode,round:room.round,me:me+1,
      players:room.players.map(p=>p?({joined:true,name:p.name,lockedInitial:p.initial!==null,lockedAfter:p.after!==null,...(reveal?{initial:p.initial,after:p.after}:{})}):({joined:false})),
      scenario:s?{id:s.id,title:s.title,category:s.category,level:s.level,mode:s.mode,angle:s.angle,setup:s.setup,prompt:s.prompt,initialType:s.initialType||"choice",choices:s.choices,
        complication:["complication","after","reveal"].includes(room.phase)?s.complication:null,
        complicationPrompt:["complication","after","reveal"].includes(room.phase)?s.complicationPrompt:null,
        complicationType:["complication","after","reveal"].includes(room.phase)?s.complicationType:null,
        complicationChoices:["complication","after","reveal"].includes(room.phase)?s.complicationChoices:null,
        ...(reveal?{dimensions:s.dimensions,notes:s.notes}:{})}:null};
  }
  async fetch(request){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==="POST"&&path==="/create"){
      if(await this.load())return json({error:"ROOM_EXISTS"},409);
      const body=await request.json().catch(()=>({})),deck=body.deck||"ALL",mode=body.mode||"ALL",first=this.pick(deck,mode);
      const room={code:body.code,deck,mode,stats:body.stats===true,phase:"lobby",round:1,scenarioId:first.id,
        players:[{token:token(),name:String(body.name||"Player 1").slice(0,30),initial:null,after:null}],createdAt:Date.now(),updatedAt:Date.now()};
      await this.save(room);return json({code:room.code,playerToken:room.players[0].token},201);
    }
    const room=await this.load();if(!room)return json({error:"ROOM_NOT_FOUND"},404);
    if(request.method==="POST"&&path==="/join"){
      if(room.players.length>=2)return json({error:"ROOM_FULL"},409);
      const body=await request.json().catch(()=>({})),p={token:token(),name:String(body.name||"Player 2").slice(0,30),initial:null,after:null};
      room.players.push(p);room.phase="initial";await this.save(room);return json({code:room.code,playerToken:p.token},201);
    }
    const t=request.headers.get("X-Player-Token")||url.searchParams.get("token"),pi=this.playerIndex(room,t);
    if(pi<0)return json({error:"INVALID_PLAYER"},401);
    if(request.method==="GET"&&path==="/")return json(this.view(room,t));
    if(request.method==="POST"&&path==="/answer"){
      const body=await request.json().catch(()=>({})),s=this.scenario(room);
      if(room.phase==="initial"){
        if((s.initialType||"choice")==="text"){
          const answer=String(body.text||"").trim().slice(0,500);if(!answer)return json({error:"ANSWER_REQUIRED"},400);
          room.players[pi].initial={type:"text",value:answer};this.count(room,s,"initial","text");
        } else {
          const choice=Number(body.choice);if(!Number.isInteger(choice)||choice<0||choice>=s.choices.length)return json({error:"INVALID_CHOICE"},400);
          room.players[pi].initial={type:"choice",value:choice};this.count(room,s,"initial",String(choice));
        }
        if(this.both(room,"initial"))room.phase="complication";
      }
      else if(room.phase==="complication"||room.phase==="after"){
        room.phase="after";
        if(s.complicationType==="text"){
          const answer=String(body.text||"").trim().slice(0,500);
          if(!answer)return json({error:"ANSWER_REQUIRED"},400);
          room.players[pi].after={type:"text",value:answer};this.count(room,s,"boom","text");
        } else {
          const choice=Number(body.choice);
          if(!Number.isInteger(choice)||choice<0||choice>=s.complicationChoices.length)return json({error:"INVALID_CHOICE"},400);
          room.players[pi].after={type:"choice",value:choice};this.count(room,s,"boom",String(choice));
        }
        if(this.both(room,"after"))room.phase="reveal";
      }
      else return json({error:"NOT_ACCEPTING_ANSWER",phase:room.phase},409);
      await this.save(room);return json(this.view(room,t));
    }
    if(request.method==="POST"&&path==="/next"){
      if(room.phase!=="reveal")return json({error:"ROUND_NOT_FINISHED"},409);
      if(pi!==0)return json({error:"HOST_ONLY"},403);
      const next=this.pick(room.deck,room.mode||"ALL",room.scenarioId);room.scenarioId=next.id;room.round++;room.phase="initial";
      room.players.forEach(p=>{p.initial=null;p.after=null});await this.save(room);return json(this.view(room,t));
    }
    return json({error:"NOT_FOUND"},404);
  }
}
