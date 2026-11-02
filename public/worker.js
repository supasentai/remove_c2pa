import { removeC2pa } from './lib/c2pa.js';
self.onmessage = ({ data: { id, buffer } }) => {
  try {
    const { output, before, after } = removeC2pa(buffer);
    self.postMessage({ id, output: output.buffer, before, after }, [output.buffer]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
