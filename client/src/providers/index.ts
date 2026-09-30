import { MockProvider } from './mock';
import { spotifyProvider, appleProvider, youtubeProvider } from './real';
export { MockProvider } from './mock';
export const providerAdapters = { mock: new MockProvider(), spotify: spotifyProvider, apple: appleProvider, youtube: youtubeProvider };
