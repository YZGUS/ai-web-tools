#!/usr/bin/env node
/**
 * 冒烟：CDP 连通性
 *   node tests/smoke/cdp.mjs
 */
import { probeCdp } from '../../index.mjs';

const info = await probeCdp();
console.log(JSON.stringify(info, null, 2));
process.exit(info.ok ? 0 : 1);
