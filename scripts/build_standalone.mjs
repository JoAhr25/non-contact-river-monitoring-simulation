#!/usr/bin/env node
import { buildAppJs, buildStandaloneHtml, runBuildCli } from './build.mjs';

export { buildAppJs, buildStandaloneHtml };

runBuildCli();
