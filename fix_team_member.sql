INSERT INTO team_members (team_id, user_id, role) VALUES ('c4e13a14-f2a2-4c3b-baaa-89b99808f2ae', '3d0c4fed-5e0e-43f2-b037-c64ce781e008', 'owner') ON CONFLICT (team_id, user_id) DO NOTHING;
