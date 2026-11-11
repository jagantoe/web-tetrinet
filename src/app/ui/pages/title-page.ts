/** Panel18 — start-up title screen. */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-title-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="abs" style="left:-2px; top:-1px; width:594px; height:411px">
      <div class="bevel-lowered" style="left:27px; top:29px; width:336px; height:200px"></div>
      <img class="abs" src="assets/ui/title-tetrinet.png" alt="TetriNET" style="left:28px; top:30px" width="334" height="198" />
      <div class="bevel-lowered" style="left:394px; top:31px; width:175px; height:104px"></div>
      <img class="abs" src="assets/ui/title-stormcat.png" alt="StormCat" style="left:395px; top:32px" width="171" height="101" />
      <div class="lbl" style="left:394px; top:153px; font-size:15px; line-height:18px; font-weight:bold; text-decoration:underline">StormCat Productions</div>
      <div class="lbl" style="left:394px; top:173px">Copyright (c) 1997 by St0rmCat</div>
      <div class="lbl" style="left:394px; top:186px">All Rights Reserved.</div>
      <div class="lbl" style="left:393px; top:215px; font-size:13px; line-height:16px; font-weight:bold">Version 1.13 PUBLIC</div>
      <div class="lbl" style="left:403px; top:262px; font-weight:bold">Web Recreation:</div>
      <div class="lbl" style="left:421px; top:282px; font-weight:bold">Angular · WebRTC</div>
      <div class="lbl" style="left:421px; top:297px; font-weight:bold">Browser to browser,</div>
      <div class="lbl" style="left:421px; top:311px; font-weight:bold">no server needed</div>
      <div class="abs about" style="left:27px; top:247px; width:341px; height:94px">
        This is a faithful browser recreation of TetriNET v1.13 by St0rmCat.
        Gameplay, timing and special blocks are ported from the original
        program. Click <b>Server Settings</b> to host a game, or
        <b>Client Settings</b> to join one. Players connect directly to
        each other by exchanging a join code and a reply code.
      </div>
      <div class="lbl" style="left:47px; top:368px; width:501px; text-align:center; font-size:12px; font-weight:bold">
        Original TetriNET (c) 1997 St0rmCat. Read TETRINET.TXT for the rules of the special blocks!
      </div>
    </div>
  `,
  styles: `
    :host { position: absolute; inset: 0; }
    .about { font-family: var(--arial); font-size: 12px; line-height: 15px; }
  `,
})
export class TitlePage {}
