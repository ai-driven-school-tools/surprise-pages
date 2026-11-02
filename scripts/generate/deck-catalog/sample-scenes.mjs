/** Code-native sample illustrations. No network, bitmap files, or private assets. */
const rect=(x,y,w,h,fill,rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const path=(d,fill)=>`<path d="${d}" fill="${fill}"/>`;
const plant=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})">${path('M0 0Q-82-80-32-150Q22-100 0 0','#5e8070')}${path('M0-16Q12-150 68-128Q86-58 0-16','#9db5a0')}${rect(-5,-96,7,118,'#506953')}${path('M-38 0H38L27 72H-27Z','#d9b490')}</g>`;
const window=(x,y,w,h)=>`${rect(x,y,w,h,'#cedde0')}${path(`M${x} ${y+h}l${w*.42} -${h*.45} ${w*.2} ${h*.2} ${w*.38} -${h*.38}V${y+h}Z`,'#9eafa4')}${rect(x+w*.47,y,10,h,'#f5f3ec')}${rect(x,y+h*.53,w,9,'#f5f3ec')}`;
const desk=(x,y,w)=>`${path(`M${x+30} ${y+18}h16v140h-16ZM${x+w-46} ${y+18}h16v140h-16Z`,'#5f625a')}${rect(x,y,w,24,'#b68e67',5)}${rect(x+30,y-8,w-60,8,'#d9b595',3)}`;
const chair=(x,y,color='#718675')=>`${rect(x,y,72,85,color,16)}${rect(x-10,y+80,92,16,color,6)}${rect(x+2,y+96,6,58,'#6b7068')}${rect(x+65,y+96,6,58,'#6b7068')}`;
const shelf=(x,y)=>`${rect(x,y,190,280,'#bfa88b')}${[15,105,195].map((top,i)=>`${rect(x+10,y+top,170,75,'#e7ddd0')}${[0,1,2,3,4].map(n=>rect(x+20+n*26,y+top+10+(n%2)*8,18,65-(n%2)*8,['#536d62','#aa8060','#d7c7ac'][((n+i)%3)])).join('')}`).join('')}`;
const laptop=(x,y)=>`${rect(x,y,110,72,'#596c66',5)}${rect(x+7,y+7,96,56,'#dce6df',2)}${path(`M${x-12} ${y+72}h134l-12 8h-110Z`,'#8d9b94')}`;
const scenes={
 'composition-split-right':{name:'窓辺の打ち合わせスペース',body:window(335,40,265,235)+desk(105,285,440)+chair(140,306)+chair(388,306)+plant(650,332,.85)},
 'composition-split-left':{name:'本棚のある集中スペース',body:shelf(65,60)+window(410,50,230,210)+desk(275,300,380)+laptop(420,220)+chair(350,325)},
 'composition-headline-top':{name:'チームで囲む長いテーブル',body:window(100,30,520,225)+desk(65,290,610)+chair(100,320)+chair(300,320)+chair(500,320)+plant(690,295,.7)},
 'composition-headline-bottom':{name:'アイデアを広げる作業机',body:rect(260,50,360,195,'#dedfd3',8)+[0,1,2,3,4,5].map(n=>rect(285+n%3*100,80+Math.floor(n/3)*70,72,48,n%2?'#c5b99a':'#a2b5a6',2)).join('')+desk(140,310,465)+laptop(190,230)+chair(415,330)+plant(70,333,.65)},
 'composition-photo-bleed':{name:'大きな窓のある明るいラウンジ',body:window(65,15,610,275)+rect(95,300,280,95,'#a0ad99',22)+rect(105,285,260,50,'#b1bdaa',18)+desk(415,315,210)+plant(655,350,.95)},
 'composition-photo-panel':{name:'緑を囲む静かな読書室',body:shelf(40,60)+shelf(505,60)+rect(285,265,160,140,'#a79c80',24)+rect(300,255,130,70,'#c3b69c',18)+plant(345,155,.8)},
 'composition-wide-margin':{name:'ノートとコーヒーのある机',body:window(65,35,325,225)+desk(140,300,475)+rect(330,265,135,26,'#f8f5e9',3)+rect(490,257,34,42,'#eeeadb',5)+plant(620,330,.85)},
 'composition-photo-rail':{name:'天井の高い窓辺の仕事場',body:window(245,15,245,315)+desk(180,350,380)+chair(285,355)+plant(575,350,.85)},
 'composition-photo-strip':{name:'窓沿いに並ぶワークスペース',body:window(40,25,660,210)+desk(30,295,680)+[120,320,520].map(x=>laptop(x,215)+chair(x+10,320)).join('')},
 'composition-circle-crop':{name:'一人で考える小さな書斎',body:window(230,30,300,220)+desk(170,295,420)+laptop(320,215)+chair(340,325)+plant(150,345,.8)},
 'editorial-cover-window':{name:'記録を持ち寄るチームの作業室',body:window(360,30,305,235)+shelf(70,60)+desk(285,310,350)+chair(385,332)+laptop(455,230)},
 'editorial-cover-horizon':{name:'知見を共有する広い会議室',body:window(55,25,625,230)+desk(100,300,550)+chair(140,325)+chair(435,325)+plant(50,333,.7)},
 'editorial-divider-photo':{name:'対話を始めるミーティングコーナー',body:window(245,35,320,205)+desk(220,300,300)+chair(120,305)+chair(545,305)+plant(665,335,.8)},
 'editorial-list-photo-aside':{name:'記録を整理するデスク',body:shelf(425,40)+desk(90,300,420)+laptop(160,220)+rect(320,275,100,20,'#f4eddd',3)+chair(190,335)+plant(645,347,.7)},
};
export function sampleScene(id){
 const scene=scenes[id];if(!scene)throw Error('Missing authored scene: '+id);
 return {label:scene.name+'（イラスト）',svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 480" width="740" height="480">${rect(0,0,740,480,'#ece8dc')}${path('M0 350H740V480H0Z','#d3cabb')}${path('M0 0H42V350H0Z','#e0dacb')}${scene.body}</svg>`};
}
