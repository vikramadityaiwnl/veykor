export interface UserProfile {
  username: string;
  tag: string;
  status: string;
}

export interface UpdateProfileRequest {
  username: string;
  tag: string;
  status: string;
}
