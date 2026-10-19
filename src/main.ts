import { bootstrapApplication, provideNativeScriptRouter, runNativeScriptAngularApp } from '@nativescript/angular';
import { provideZonelessChangeDetection } from '@angular/core';
import { Application } from '@nativescript/core';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// Hebrew-first: mirror the whole native window (toolbar, back arrow, dialogs) regardless of the device locale.
if (__ANDROID__) {
  Application.android.on('activityCreated', ({ activity }) => activity.getWindow().getDecorView().setLayoutDirection(android.view.View.LAYOUT_DIRECTION_RTL));
}

runNativeScriptAngularApp({
  appModuleBootstrap: () =>
    bootstrapApplication(AppComponent, {
      providers: [provideNativeScriptRouter(routes), provideZonelessChangeDetection()],
    }),
});
