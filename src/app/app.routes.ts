import { Routes } from '@angular/router';
import { WelcomeComponent } from './features/welcome.component';
import { PortionsComponent } from './features/portions.component';
import { VerseListComponent } from './features/verse-list.component';
import { LessonComponent } from './features/lesson.component';
import { PracticeComponent } from './features/practice.component';
import { ResultsComponent } from './features/results.component';
import { SettingsComponent } from './features/settings.component';
import { AudioSpikeComponent } from './spike/audio-spike.component';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'portions', component: PortionsComponent },
  { path: 'portion/:id', component: VerseListComponent },
  { path: 'verse/:id', component: PracticeComponent },
  { path: 'lesson/:verseId', component: LessonComponent },
  { path: 'results/:id', component: ResultsComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'diagnostics', component: AudioSpikeComponent },
];
