import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EpisodeProject, Scene } from "@/lib/types";
import { AnimatedCaptions } from "./Captions";
import { DataChartScene, MapStoryScene, SourceHighlightScene } from "./EvidenceVisualScenes";

const bg = "#070b16";
const white = "#f7f9ff";
const muted = "#9eabc8";
const blue = "#6c7cff";
const cyan = "#55d8ff";
const red = "#ff6f86";
const green = "#63e6a7";

function FrameChrome({ eyebrow, project, children }: { eyebrow: string; project: EpisodeProject; children: React.ReactNode }) {
  const evidenceMode = project.episode.storyMode && project.episode.storyMode !== "hps";
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 85% 8%, rgba(85,216,255,.16), transparent 32%), radial-gradient(circle at 10% 5%, rgba(108,124,255,.23), transparent 28%), #070b16",
        color: white,
        padding: 90,
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 5, color: cyan, textTransform: "uppercase", marginBottom: 24 }}>{eyebrow}</div>
      {children}
      <div style={{ position: "absolute", right: 72, bottom: 48, display: "flex", gap: 10, alignItems: "center", color: muted, fontSize: 21 }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: `linear-gradient(135deg, ${blue}, ${cyan})`, color: white, fontSize: 16, fontWeight: 1000 }}>{evidenceMode ? "E" : "H"}</span>
        {evidenceMode ? "Evidence Studio · Show your work" : "Proof of Origin · HPS"}
      </div>
    </AbsoluteFill>
  );
}

function Headline({ children, maxWidth = 1480 }: { children: React.ReactNode; maxWidth?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18 } });
  return <div style={{ fontSize: 84, fontWeight: 1000, letterSpacing: -4.5, lineHeight: 0.98, maxWidth, transform: `translateY(${interpolate(s,[0,1],[50,0])}px)`, opacity: s }}>{children}</div>;
}

function Body({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  return <div style={{ marginTop: 30, maxWidth: 1280, fontSize: 34, lineHeight: 1.42, color: muted, opacity: interpolate(frame,[8,20],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}) }}>{children}</div>;
}

function GenericScene({ scene, project }: { scene: Scene; project: EpisodeProject }) {
  if (scene.kind === "data_chart") return <DataChartScene scene={scene} />;
  if (scene.kind === "map_story") return <MapStoryScene scene={scene} />;
  if (scene.kind === "source_highlight") return <SourceHighlightScene scene={scene} />;

  const asset = project.assets.find((item) => item.id === scene.assetId)?.dataUrl;
  const frame = useCurrentFrame();

  if (scene.kind === "document") {
    return (
      <FrameChrome eyebrow={scene.eyebrow} project={project}>
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 70, alignItems: "center", height: "80%" }}>
          <div><Headline maxWidth={880}>{scene.headline}</Headline><Body>{scene.body}</Body></div>
          <div style={{ height: 650, borderRadius: 28, border: "1px solid rgba(255,255,255,.12)", background: asset ? "#0e1424" : "linear-gradient(180deg,#f4f6fb,#dce3f0)", boxShadow: "0 40px 120px rgba(0,0,0,.45)", overflow: "hidden", position: "relative" }}>
            {asset ? <Img src={asset} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <><div style={{ height: 80, background: "#17345b", marginBottom: 30 }} />{[1,2,3,4,5,6].map((n)=><div key={n} style={{height:16,width:`${74-n*5}%`,background:"#aab7ca",borderRadius:8,margin:"22px 52px"}} />)}</>}
          </div>
        </div>
      </FrameChrome>
    );
  }

  if (scene.kind === "value_swap") {
    const enter = spring({ frame: Math.max(0, frame - 20), fps: 30, config: { damping: 15 } });
    return <FrameChrome eyebrow={scene.eyebrow} project={project}><Headline>{scene.headline}</Headline><div style={{marginTop:95,display:"flex",alignItems:"center",gap:54}}><div style={{padding:"30px 38px",border:"1px solid rgba(255,255,255,.13)",borderRadius:24,fontSize:72,fontWeight:1000,textDecoration:"line-through",textDecorationColor:red}}>{scene.before||"ORIGINAL"}</div><div style={{fontSize:60,color:muted}}>→</div><div style={{padding:"30px 38px",border:`1px solid ${red}`,borderRadius:24,background:"rgba(255,111,134,.09)",fontSize:72,fontWeight:1000,color:red,transform:`scale(${interpolate(enter,[0,1],[.82,1])})`,opacity:enter}}>{scene.after||"CHANGED"}</div></div><Body>{scene.body}</Body></FrameChrome>;
  }

  if (scene.kind === "confidence") {
    const score = scene.metric ?? 79;
    const width = interpolate(frame,[12,65],[0,score],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
    return <FrameChrome eyebrow={scene.eyebrow} project={project}><Headline>{scene.headline}</Headline><div style={{marginTop:70,maxWidth:1250}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"end"}}><span style={{fontSize:28,color:muted}}>Relationship confidence</span><strong style={{fontSize:76}}>{Math.round(width)}/100</strong></div><div style={{height:24,marginTop:18,background:"rgba(255,255,255,.08)",borderRadius:999,overflow:"hidden"}}><div style={{width:`${width}%`,height:"100%",borderRadius:999,background:`linear-gradient(90deg,${blue},${cyan})`}} /></div></div><Body>{scene.body}</Body></FrameChrome>;
  }

  if (scene.kind === "diagram") {
    const labels = scene.visualLabels?.length ? scene.visualLabels : ["Observation","Interpretation","Context","Implication"];
    return <FrameChrome eyebrow={scene.eyebrow} project={project}><Headline>{scene.headline}</Headline><div style={{display:"flex",gap:18,marginTop:70}}>{labels.map((item,index)=><React.Fragment key={`${item}-${index}`}><div style={{width:300,minHeight:150,borderRadius:22,padding:24,border:"1px solid rgba(255,255,255,.11)",background:"rgba(255,255,255,.04)"}}><span style={{color:muted,fontSize:18}}>0{index+1}</span><strong style={{display:"block",fontSize:29,marginTop:14}}>{item}</strong></div>{index<labels.length-1&&<div style={{alignSelf:"center",fontSize:36,color:muted}}>→</div>}</React.Fragment>)}</div><Body>{scene.body}</Body></FrameChrome>;
  }

  if (scene.kind === "timeline") {
    const labels = scene.visualLabels?.length ? scene.visualLabels : ["Baseline","Change","Evidence","Context","Meaning"];
    return <FrameChrome eyebrow={scene.eyebrow} project={project}><Headline>{scene.headline}</Headline><div style={{marginTop:88,display:"flex",alignItems:"center"}}>{labels.map((step,index)=><React.Fragment key={`${step}-${index}`}><div style={{textAlign:"center"}}><div style={{width:92,height:92,borderRadius:999,display:"grid",placeItems:"center",background:index===labels.length-1?green:blue,fontWeight:1000,fontSize:26}}>{index+1}</div><div style={{marginTop:14,fontSize:22,fontWeight:900,maxWidth:170}}>{step}</div></div>{index<labels.length-1&&<div style={{height:4,flex:1,background:"rgba(255,255,255,.13)",margin:"0 15px 42px"}} />}</React.Fragment>)}</div><Body>{scene.body}</Body></FrameChrome>;
  }

  if (scene.kind === "quote") {
    return <FrameChrome eyebrow={scene.eyebrow} project={project}><div style={{marginTop:90,maxWidth:1500}}><div style={{fontSize:170,lineHeight:.5,color:cyan,opacity:.35}}>“</div><Headline>{scene.headline}</Headline><div style={{marginTop:48,fontSize:46,lineHeight:1.25,color:cyan,fontWeight:800}}>{scene.body}</div></div></FrameChrome>;
  }

  if (scene.kind === "cta") {
    return <FrameChrome eyebrow={scene.eyebrow} project={project}><div style={{marginTop:120}}><Headline>{scene.headline}</Headline><Body>{scene.body}</Body><div style={{marginTop:58,display:"inline-flex",padding:"20px 28px",borderRadius:16,background:"rgba(85,216,255,.24)",border:"1px solid rgba(85,216,255,.38)",fontSize:28,fontWeight:1000}}>FOLLOW THE NEXT EVIDENCE TRAIL</div></div></FrameChrome>;
  }

  return <FrameChrome eyebrow={scene.eyebrow} project={project}><div style={{marginTop:scene.kind === "hook" ? 130 : 20}}><Headline>{scene.headline}</Headline>{scene.kind === "proof_card" ? <div style={{marginTop:58,padding:42,borderRadius:30,border:"1px solid rgba(85,216,255,.24)",background:"linear-gradient(135deg,rgba(108,124,255,.13),rgba(85,216,255,.04))",maxWidth:1350}}><Body>{scene.body}</Body></div> : <Body>{scene.body}</Body>}</div></FrameChrome>;
}

export const OriginEpisode: React.FC<EpisodeProject> = (project) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {project.scenes.map((scene) => {
        const durationInFrames = Math.max(1, Math.round(scene.durationSec * 30));
        const start = from;
        from += durationInFrames;
        return <Sequence key={scene.id} from={start} durationInFrames={durationInFrames}><GenericScene scene={scene} project={project} /></Sequence>;
      })}
      {project.narration?.audioDataUrl && <Audio src={project.narration.audioDataUrl} />}
      <AnimatedCaptions track={project.narration} />
    </AbsoluteFill>
  );
};
