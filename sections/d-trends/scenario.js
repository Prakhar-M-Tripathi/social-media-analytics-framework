// Section D practice scenario: a larger synthetic (made up) dataset built in the browser.
// 45 days, 6 platforms, about 1,500 anonymous accounts, English, Hinglish and Hindi posts.
// It contains known events so the trend detection can be checked against the truth:
//   1. Petrol price hike rumour: starts on Telegram, spreads to X and Facebook, keeps growing
//   2. UPI outage: a one day spike on the last complete day
//   3. Exam paper leak: peaks in the middle of the period, then fades
//   4. Onion prices: a new topic that appears in the last week and rises
//   5. Diwali sale: grows steadily towards the festival
//   plus steady background talk (cricket, weather, metro, phone reviews, OTT shows)
// Same seed gives the same data every time, so results are reproducible.
(function(){
  function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  const R=rng(26152);
  const pick=a=>a[Math.floor(R()*a.length)];
  function poisson(l){ if(l<=0) return 0; if(l>40) return Math.max(0,Math.round(l+Math.sqrt(l)*gauss())); let L=Math.exp(-l),k=0,p=1; do{k++;p*=R();}while(p>L); return k-1; }
  function gauss(){ return Math.sqrt(-2*Math.log(R()+1e-12))*Math.cos(2*Math.PI*R()); }
  function hex(n){ let s=""; for(let i=0;i<16;i++) s+="0123456789abcdef"[Math.floor(R()*16)]; return "anon-"+s; }

  const PLATFORMS=["X","Telegram","Instagram","Facebook","Reddit","YouTube"];
  const USERS=[...Array(1500)].map(()=>hex());
  const user=()=> R()<0.25? USERS[Math.floor(R()*60)] : USERS[Math.floor(R()*USERS.length)];

  const T={
    petrol:{tags:["#PetrolPriceHike","#FuelPrice"],t:[
      "Petrol price hike again from Monday, ₹8 per litre more. Is this true?",
      "Petrol price hike ki news sach hai kya? Pump pe lambi line lag gayi",
      "पेट्रोल की कीमत फिर बढ़ने वाली है, टंकी आज ही भरवा लो",
      "Fuel price hike rumour is everywhere, no official notice from oil companies yet",
      "Heard petrol price hike will hit tonight, everyone rushing to petrol pumps",
      "Petrol price hike se transport aur sabzi sab mehenga ho jayega",
      "Oil companies say no decision on petrol price hike, please verify before sharing",
      "Petrol price hike forward aaya family group mein, koi confirm karo"]},
    upi:{tags:["#UPIDown","#UPIOutage"],t:[
      "UPI down since morning, payments failing at every shop",
      "UPI outage again, GPay and PhonePe both not working",
      "UPI server down hai, cash bhi nahi hai paas mein",
      "यूपीआई काम नहीं कर रहा, दुकान पर पेमेंट फेल हो गया",
      "Bank says UPI outage due to technical issue, fix in progress",
      "UPI down and metro card recharge also stuck, what a day"]},
    leak:{tags:["#PaperLeak","#ExamLeak"],t:[
      "Exam paper leak allegations, students demanding re exam",
      "Paper leak hua hai toh exam cancel karo, mehnat waste ho gayi",
      "परीक्षा का पेपर लीक, छात्रों का प्रदर्शन जारी",
      "Exam board denies paper leak, says investigation started",
      "Paper leak case: two arrested, re exam date not announced yet",
      "Students protest paper leak outside board office"]},
    onion:{tags:["#OnionPrice"],t:[
      "Onion prices crossed ₹80 per kg in local mandi",
      "Pyaz ke daam aasman chhoo rahe hain, onion prices 90 tak",
      "प्याज के दाम बढ़े, रसोई का बजट बिगड़ा",
      "Onion prices rising before festival season, traders blame rain",
      "Government may release onion stock to control onion prices"]},
    diwali:{tags:["#DiwaliSale","#FestiveOffers"],t:[
      "Diwali sale offers on phones are actually good this year",
      "Diwali sale mein TV pe 40% off, lena chahiye kya?",
      "दिवाली सेल में कपड़ों पर भारी छूट",
      "Diwali sale traffic crashed the shopping app for a while",
      "Best Diwali sale deals list, sharing for everyone",
      "Diwali sale bank card discount details inside"]},
    cricket:{tags:["#INDvsAUS","#Cricket"],t:[
      "What a match last night, cricket team showed real fight",
      "Cricket mein aaj batting order galat tha yaar",
      "क्रिकेट मैच में शानदार जीत, गेंदबाजों ने कमाल किया",
      "Cricket selection debate again, too many changes in squad",
      "Watching the cricket highlights again, that catch was unreal"]},
    weather:{tags:["#Monsoon","#Weather"],t:[
      "Heavy rain weather alert for the city today, stay safe",
      "Weather aaj phir kharab hai, baarish band hi nahi ho rahi",
      "मौसम विभाग ने भारी बारिश की चेतावनी दी",
      "Weather finally cooling down, evenings are pleasant now",
      "Waterlogging after rain, weather department issues yellow alert"]},
    metro:{tags:["#MetroUpdate"],t:[
      "Metro services delayed on blue line this morning",
      "Metro mein bheed itni ki saans lena mushkil",
      "मेट्रो की नई लाइन जल्द शुरू होगी",
      "Metro fare card recharge queue is too long",
      "New metro station opening next month, finally"]},
    phone:{tags:["#PhoneReview"],t:[
      "New phone launch review: camera is great, battery average",
      "Phone launch event was boring, same features as last year",
      "नया फोन लॉन्च, कीमत थोड़ी ज्यादा है",
      "Phone battery life after one week of use is impressive",
      "Phone launch price leaked, looks expensive for what it offers"]},
    ott:{tags:["#OTT","#WebSeries"],t:[
      "New web series on OTT is worth a weekend binge",
      "OTT pe nayi series dekhi, story strong hai",
      "ओटीटी पर नई फिल्म रिलीज, दर्शकों की मिली जुली राय",
      "Web series finale was disappointing honestly",
      "OTT subscription prices going up again"]}
  };
  const DAYS=45, START=Date.UTC(2026,8,25);   // 25 Sep 2026
  // expected posts per day for each topic on day d (0..44)
  const RATE={
    cricket:d=>22+6*Math.sin(d/3), weather:d=>18-d*0.12, metro:d=>14, phone:d=>13+(d>20&&d<24?10:0), ott:d=>12+(d%7>=5?6:0),
    petrol:d=> d<24?0.4 : 2*Math.exp((d-24)*0.17),
    upi:d=> d===43?75 : 0.3,
    leak:d=> 1+42*Math.exp(-((d-17)**2)/18),
    onion:d=> d<37?0.15 : 3+(d-37)*3.2,
    diwali:d=> 2+d*0.55
  };
  // where each topic tends to be posted
  const PLAT={
    petrol:d=> d<27?["Telegram","Telegram","Telegram","Facebook"] : d<31?["Telegram","X","X","Facebook","Facebook"] : PLATFORMS.concat(["X","Facebook","Telegram"]),
    upi:()=>["X","X","X","Reddit","Telegram"], leak:()=>["X","Reddit","YouTube","Telegram"], onion:()=>["Facebook","X","Telegram","YouTube"],
    diwali:()=>["Instagram","Instagram","Facebook","YouTube","X"], cricket:()=>PLATFORMS, weather:()=>PLATFORMS, metro:()=>["X","Reddit","Facebook"],
    phone:()=>["YouTube","Reddit","X","Instagram"], ott:()=>["Instagram","X","Reddit","YouTube"]
  };
  const rows=[]; let id=0; const recent={};
  for(let d=0; d<DAYS; d++){
    const dayEnd = d===DAYS-1 ? 0.4 : 1;   // the newest day is only partly collected
    for(const k in T){
      const n=poisson(RATE[k](d)*dayEnd);
      for(let i=0;i<n;i++){
        const t=START+d*864e5+Math.floor(R()*864e5*dayEnd);
        let text=pick(T[k].t);
        if(R()<0.45) text+=" "+pick(T[k].tags);
        if(R()<0.15) text+=pick([" 😡"," 🙏"," 😂"," !!"," ?"]);
        const pid="sim-d-"+(++id);
        const pool=recent[k]||(recent[k]=[]);
        const parent= pool.length && R()<0.25 ? pick(pool) : "";
        rows.push({post_id:pid, platform:pick(PLAT[k](d)), user_id:user(), timestamp:new Date(t).toISOString().slice(0,19).replace("T"," "), text, parent_id:parent});
        pool.push(pid); if(pool.length>40) pool.shift();
      }
    }
  }
  // a few accounts copy pasting the petrol rumour many times (should be counted once each)
  for(let r=0;r<40;r++){ const u=USERS[1400+(r%5)]; const t=START+(38+(r%5))*864e5+r*997; rows.push({post_id:"sim-d-"+(++id), platform:"Telegram", user_id:u, timestamp:new Date(t).toISOString().slice(0,19).replace("T"," "), text:T.petrol.t[0]+" #PetrolPriceHike", parent_id:""}); }
  rows.sort((a,b)=>a.timestamp<b.timestamp?-1:1);
  window.SECTION_D_SCENARIO=rows;
})();
