-- BDO Software CRM — cloisonnement des données par collaborateur.
--
-- Le document partagé (`app_state`) contient les données de toute l'équipe. Il n'est plus
-- lisible directement depuis le navigateur : chaque utilisateur reçoit uniquement la
-- projection de son portefeuille, calculée par les Server Actions (clé de service, côté
-- serveur uniquement). Seul le directeur commercial reçoit l'ensemble des données.

drop policy if exists app_state_select on public.app_state;
revoke select on public.app_state from anon, authenticated;
-- RLS reste activée sans aucune politique : même un droit SELECT ré-accordé ne renverrait rien.
