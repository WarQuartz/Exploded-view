const $=s=>document.querySelector(s);
const screens=["home","lobby","game","reveal"];
let code=localStorage.evCode||null, token=localStorage.evToken||null, me=null, timer=null;

function show(name){screens.forEach(x=>$(`#screen-${x}`).classList.toggle("hidden",x!==name))}
async function api(path,opts={}){
  opts.headers={...(opts.headers||{}),"Content-Type":"application/json"};
  if(token) opts.headers["X-Player-Token"]=token;
  const r=await fetch(path,opts); const j=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(j.error||"Request failed"),{status:r.status,data:j});
  return j;
}
function save(c,t){code=c;token=t;localStorage.evCode=c;localStorage.evToken=t}
function clear(){code=token=null;localStorage.removeItem("evCode");localStorage.removeItem("evToken")}
function nameVal(){return ($("#name").value||"Anonymous Human").trim()}
function choiceMarkup(s){return s.choices.map((c,i)=>`<button class="choice" data-i="${i}"><b>${String.fromCharCode(65+i)}.</b> ${c}</button>`).join("")}
function setDecks(){
 const cats=["ALL","Weird Little Humans","Partners in Crime","Moral Gremlins","Chemistry Lab","Money & Power","Oh Shit, That's Deep"];
 $("#deck").innerHTML=cats.map(c=>`<option value="${c}">${c==="ALL"?"Surprise Me":c}</option>`).join("")
}
setDecks();

$("#create").onclick=async()=>{
 try{
   const j=await api("/api/rooms",{method:"POST",body:JSON.stringify({name:nameVal(),deck:$("#deck").value})});
   save(j.code,j.playerToken); await refresh();
 }catch(e){alert(e.message)}
};
$("#join").onclick=async()=>{
 try{
   const c=$("#joinCode").value.trim().toUpperCase();
   const j=await api(`/api/rooms/${c}/join`,{method:"POST",body:JSON.stringify({name:nameVal()})});
   save(j.code,j.playerToken); await refresh();
 }catch(e){alert(e.data?.error==="ROOM_FULL"?"That room already has two humans.":e.message)}
};

async function refresh(){
 if(!code||!token){show("home");return}
 try{
   const r=await api(`/api/rooms/${code}`); me=r.me;
   if(r.phase==="lobby") renderLobby(r);
   else if(r.phase==="reveal") renderReveal(r);
   else renderGame(r);
 }catch(e){
   if(e.status===401||e.status===404){clear();show("home")}
 }
}
function renderLobby(r){
 show("lobby");$("#roomCode").textContent=r.code;$("#bigCode").textContent=r.code;
 $("#lobbyStatus").textContent=`${r.players.filter(p=>p.joined).length} of 2 players joined`;
}
function renderGame(r){
 show("game"); const s=r.scenario;
 $("#gameCode").textContent=r.code;$("#round").textContent=r.round;
 $("#tags").innerHTML=`<span class="tag">${s.category}</span><span class="tag">Level ${s.level}</span>`;
 $("#scenarioTitle").textContent=s.title;$("#setup").textContent=s.setup;$("#prompt").textContent=s.prompt;
 const p=r.players[r.me-1];
 const isInitial=r.phase==="initial";
 const after=r.phase==="complication"||r.phase==="after";
 $("#boom").classList.toggle("hidden",!after);
 $("#complication").classList.toggle("hidden",!after);
 $("#complication").textContent=s.complication||"";
 $("#phaseLabel").textContent=isInitial?"FIRST INSTINCT — ANSWER SECRETLY":"VARIABLE CHANGED — RE-DECIDE";
 const already = isInitial ? p.lockedInitial : p.lockedAfter;
 $("#locked").classList.toggle("hidden",!already);
 $("#choices").classList.toggle("hidden",already);
 $("#choices").innerHTML=choiceMarkup(s);
 document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>submitAnswer(+b.dataset.i));
}
async function submitAnswer(choice){
 try{await api(`/api/rooms/${code}/answer`,{method:"POST",body:JSON.stringify({choice})}); await refresh()}
 catch(e){alert(e.message)}
}
function renderReveal(r){
 show("reveal");const s=r.scenario,p1=r.players[0],p2=r.players[1],C=s.choices;
 $("#revealTitle").textContent=s.title;
 $("#answers").innerHTML=`
 <div class="answer"><b>${p1.name} — first instinct</b><br>${C[p1.initial]}</div>
 <div class="answer"><b>${p2.name} — first instinct</b><br>${C[p2.initial]}</div>
 <div class="answer"><b>${p1.name} — after BOOM</b><br>${C[p1.after]}</div>
 <div class="answer"><b>${p2.name} — after BOOM</b><br>${C[p2.after]}</div>`;
 const same0=p1.initial===p2.initial,same1=p1.after===p2.after,c1=p1.initial!==p1.after,c2=p2.initial!==p2.after;
 let bits=[
   same0?"You started from the same instinct.":"Your first instincts split.",
   same1?"After the complication, you converged.":"After the complication, you still landed differently."
 ];
 if(c1&&c2) bits.push("Both of you revised. Gerald found the pressure point.");
 else if(c1||c2) bits.push(`${c1?p1.name:p2.name} changed position while the other held.`);
 else bits.push("Neither of you moved. Now figure out whether that was principle, certainty, or stubbornness.");
 $("#analysis").innerHTML=`<p>${bits.join(" ")}</p><p><b>The useful question:</b> What made your answer feel right—not which answer wins?</p>`;
 $("#underhood").textContent=`Under the hood: ${s.dimensions.join(" • ")}. ${s.notes}`;
 $("#nextRound").classList.toggle("hidden",r.me!==1);
 $("#guestWait").classList.toggle("hidden",r.me===1);
}
$("#nextRound").onclick=async()=>{try{await api(`/api/rooms/${code}/next`,{method:"POST",body:"{}"});await refresh()}catch(e){alert(e.message)}};

if(code&&token) refresh(); else show("home");
timer=setInterval(()=>{if(code&&token)refresh()},1400);
