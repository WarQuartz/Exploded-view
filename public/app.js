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
function choiceMarkup(choices){return choices.map((c,i)=>`<button class="choice" data-i="${i}"><b>${String.fromCharCode(65+i)}.</b> ${c}</button>`).join("")}
function answerText(a,choices){if(a===null||a===undefined)return "";if(typeof a==="number")return choices?.[a]||"";return a.type==="text"?a.value:(choices?.[a.value]||"")}
function setDecks(){
 const cats=["ALL","Weird Little Humans","Partners in Crime","Moral Gremlins","Chemistry Lab","Money & Power","Oh Shit, That's Deep"];
 $("#deck").innerHTML=cats.map(c=>`<option value="${c}">${c==="ALL"?"Gerald Chooses":c}</option>`).join("");
 const modes=["ALL","Friends","Dating / Couples","Family","Coworkers","New People / Anybody","Solo"];
 $("#mode").innerHTML=modes.map(m=>`<option value="${m}">${m==="ALL"?"Anybody / Surprise Me":m}</option>`).join("")
}
setDecks();

$("#create").onclick=async()=>{
 try{
   const j=await api("/api/rooms",{method:"POST",body:JSON.stringify({name:nameVal(),deck:$("#deck").value,mode:$("#mode").value,stats:$("#statsConsent").checked})});
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
 $("#tags").innerHTML=`<span class="tag">${s.category}</span><span class="tag">${s.mode||""}</span><span class="tag">${s.angle||""}</span><span class="tag">Level ${s.level}</span>`;
 $("#scenarioTitle").textContent=s.title;$("#setup").textContent=s.setup;
 const p=r.players[r.me-1];
 const isInitial=r.phase==="initial";
 const after=r.phase==="complication"||r.phase==="after";
 $("#boom").classList.toggle("hidden",!after);
 $("#complication").classList.toggle("hidden",!after);
 $("#complication").textContent=s.complication||"";
 $("#phaseLabel").textContent=isInitial?"FIRST INSTINCT — ANSWER SECRETLY":"GERALD CHANGED THE VARIABLE";
 $("#prompt").textContent=isInitial?s.prompt:(s.complicationPrompt||"What do you do now?");
 const already = isInitial ? p.lockedInitial : p.lockedAfter;
 $("#locked").classList.toggle("hidden",!already);
 $("#choices").classList.toggle("hidden",already);
 if((isInitial && s.initialType==="text") || (!isInitial && s.complicationType==="text")){
   $("#choices").innerHTML='<textarea id="textAnswer" maxlength="500" placeholder="Your answer — the other person cannot see it yet."></textarea><button id="lockText" class="primary">LOCK MY ANSWER</button>';
   $("#lockText").onclick=()=>submitText($("#textAnswer").value);
 } else {
   const options=isInitial?s.choices:s.complicationChoices;
   $("#choices").innerHTML=choiceMarkup(options);
   document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>submitAnswer(+b.dataset.i));
 }
}
async function submitAnswer(choice){
 try{await api(`/api/rooms/${code}/answer`,{method:"POST",body:JSON.stringify({choice})}); await refresh()}
 catch(e){alert(e.message)}
}
async function submitText(value){
 if(!value.trim())return alert("Give Gerald something to work with.");
 try{await api(`/api/rooms/${code}/answer`,{method:"POST",body:JSON.stringify({text:value})});await refresh()}
 catch(e){alert(e.message)}
}
function renderReveal(r){
 show("reveal");const s=r.scenario,p1=r.players[0],p2=r.players[1],C=s.choices;
 const i1=answerText(p1.initial,C),i2=answerText(p2.initial,C),a1=answerText(p1.after,s.complicationChoices),a2=answerText(p2.after,s.complicationChoices);
 $("#revealTitle").textContent=s.title;
 $("#answers").innerHTML=`
 <div class="answer"><b>${p1.name} — first instinct</b><br>${i1}</div>
 <div class="answer"><b>${p2.name} — first instinct</b><br>${i2}</div>
 <div class="answer"><b>${p1.name} — after BOOM</b><br>${a1}</div>\n <div class="answer"><b>${p2.name} — after BOOM</b><br>${a2}</div>`;
 const same0=i1.trim().toLowerCase()===i2.trim().toLowerCase();
 const same1=a1.trim().toLowerCase()===a2.trim().toLowerCase();
 let bits=[
   same0?"You started from the same instinct.":"Your first instincts split.",
   same1?"When Gerald changed the variable, you landed in the same place.":"Gerald changed the variable and your paths split."
 ];
 bits.push("The second answer is a new decision, not a do-over of the first.");
 $("#analysis").innerHTML=`<p>${bits.join(" ")}</p><p><b>The useful question:</b> What mattered most to each of you once the new information arrived?</p>`;
 $("#underhood").textContent=`Under the hood: ${s.dimensions.join(" • ")}. ${s.notes}`;
 $("#nextRound").classList.toggle("hidden",r.me!==1);
 $("#guestWait").classList.toggle("hidden",r.me===1);
}
$("#nextRound").onclick=async()=>{try{await api(`/api/rooms/${code}/next`,{method:"POST",body:"{}"});await refresh()}catch(e){alert(e.message)}};

if(code&&token) refresh(); else show("home");
timer=setInterval(()=>{if(code&&token)refresh()},1400);
