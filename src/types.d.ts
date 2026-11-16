/** Provider-independent model. External identities require confirmed provider IDs. */
export interface ClubDataProvider {
  getClub(externalId: string): Promise<ExternalClub | null>;
  getSquad(externalTeamId: string, season: string): Promise<ExternalSquad | null>;
}
export interface ExternalClub {
  provider: string;
  externalId: string;
  name: string;
  crestAsset?: AuthorizedImage;
}
export interface AuthorizedImage {
  localPath: string;
  sha256: string;
  rightsReference: string;
}
export interface ExternalPerson {
  externalId: string;
  name: string;
  position?: string;
  role?: string;
  jerseyNumber?: number;
  photo?: AuthorizedImage;
}
export interface ExternalSquad {
  externalTeamId: string;
  season: string;
  complete: boolean;
  players: ExternalPerson[];
  staff: ExternalPerson[];
}
