import '@testing-library/jest-dom/vitest';
import { createMemoryVault, setCredentialVault } from '../credential-vault';

HTMLMediaElement.prototype.play = async () => undefined;
setCredentialVault(createMemoryVault());
