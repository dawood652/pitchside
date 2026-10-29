// Builds public/assets/player.glb from Quaternius UAL1 + UAL2 (CC0): one mannequin + pruned football clips.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, resample, dedup, meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [ual1, ual2, out] = process.argv.slice(2);
const KEEP1 = ['Idle_Loop','Idle_LookAround_Loop','Idle_Tired_Loop','Walk_Loop','Jog_Fwd_Loop','Jog_Left_Loop','Jog_Right_Loop','Jog_Bwd_Loop','Jog_Fwd_LeanL_Loop','Jog_Fwd_LeanR_Loop','Sprint_Loop','Kick','Celebration','BackFlip','Dance_Loop','Jump_Start','Jump_Loop','Jump_Land','Dodge_Left','Dodge_Right','Roll','Hit_Chest','Death01','Crouch_Idle_Loop','Turn90_L','Turn90_R','Crying'];
const KEEP2 = ['Slide_Start','Slide_Loop','Slide_Exit','Hit_Knockback','KipUp','OverhandThrow','Yes','Surprise','JogToFlip','Idle_FoldArms_Loop','Idle_No_Loop','Walk_L_Loop','Walk_R_Loop','Walk_Bwd_Loop','LayToIdle','Melee_Knee'];

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
// No EXT_meshopt_compression: the published page cannot run WebAssembly decoders.
const doc = await io.read(ual1);
const doc2 = await io.read(ual2);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));

const killAnim = (a) => {
  for (const smp of a.listSamplers()) {


    smp.dispose();
  }
  for (const ch of a.listChannels()) ch.dispose();
  a.dispose();
};
for (const a of root.listAnimations()) if (!KEEP1.includes(a.getName())) killAnim(a);

// Copy UAL2 clips into doc 1, retargeting channels by bone name
for (const a2 of doc2.getRoot().listAnimations()) {
  if (!KEEP2.includes(a2.getName())) continue;
  const a = doc.createAnimation(a2.getName());
  for (const ch2 of a2.listChannels()) {
    const target = byName.get(ch2.getTargetNode()?.getName());
    if (!target) continue;
    const s2 = ch2.getSampler();
    const inp = doc.createAccessor().setType(s2.getInput().getType()).setArray(s2.getInput().getArray().slice());
    const outp = doc.createAccessor().setType(s2.getOutput().getType()).setArray(s2.getOutput().getArray().slice());
    const s = doc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s2.getInterpolation());
    a.addSampler(s);
    a.addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch2.getTargetPath()).setSampler(s));
  }
}
// Drop finger, leaf and scale tracks, and translations except the pelvis (saves most of the size)
const FINGER = /(index|middle|pinky|ring|thumb)_0|leaf/;
for (const a of root.listAnimations())
  for (const ch of a.listChannels()) {
    const n = ch.getTargetNode()?.getName() ?? '';
    const path = ch.getTargetPath();
    if (FINGER.test(n) || path === 'scale' || (path === 'translation' && n !== 'pelvis' && n !== 'root')) {
      const smp = ch.getSampler();
      ch.dispose();
      if (smp && smp.listParents().filter((p) => p.propertyType === 'AnimationChannel').length === 0) {


        smp.dispose();
      }
    }
  }
// Put all accessors into the single buffer
const buf = root.listBuffers()[0];
for (const acc of root.listAccessors()) acc.setBuffer(buf);

await doc.transform(dedup(), resample(), prune(), quantize({ quantizeAnimation: false, pattern: /^(NORMAL|JOINTS|WEIGHTS)/ }));
await io.write(out, doc);
console.log('clips:', root.listAnimations().map((a) => a.getName()).join(', '));
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION');
  console.log('mesh', m.getName(), 'verts', pos.getCount(), 'material', p.getMaterial()?.getName(), 'min', pos.getMinNormalized ? '' : '', JSON.stringify(pos.getMin([])), JSON.stringify(pos.getMax([])));
}
