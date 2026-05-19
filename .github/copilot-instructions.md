# Copilot Instructions — LastMile Mobile (Frontend)

## Project Overview

LastMile is a mobile application designed to connect **organizers** with **volunteers** for humanitarian missions, logistics tasks, and community support operations.

The platform allows organizers to create missions such as:

- Food distribution
- Disaster relief support
- Community logistics
- Medical support missions
- Local volunteering tasks

Volunteers can:

- Discover nearby missions
- Accept tasks
- Navigate to mission locations
- Update task progress
- Collaborate with organizers

The mobile application is built using **Expo (React Native)** and consumes a backend API built with **NestJS + PostgreSQL**.

The app uses **OpenStreetMap** for location visualization.

---

# Tech Stack

Frontend framework:

- Expo
- React Native
- TypeScript

Maps:

- OpenStreetMap tiles
- react-native-maps

UI / Styling:

- Tamagui
- NativeWind (Tailwind-like styling)

Navigation:

- Expo Router

Animations:

- React Native Reanimated
- Lottie

Icons:

- Expo Vector Icons

Backend API:

- NestJS
- PostgreSQL
- Prisma ORM
- JWT Authentication

---

# Application Roles

The system has two main roles:

### Organizer

Users who create and manage volunteer missions.

Capabilities:

- Create missions
- Manage volunteers
- Track mission progress
- View mission locations
- Monitor status updates

### Volunteer

Users who participate in missions.

Capabilities:

- Discover nearby missions
- Accept or reject missions
- Navigate to mission locations
- Update task status
- Track their participation

---

# Frontend Architecture

The project follows a **feature-based modular architecture**.


src/

app/ # Expo Router routes

modules/
auth/
missions/
volunteers/
map/
profile/
notifications/

components/
ui/
common/
map/

services/
api/
auth/

hooks/

store/

utils/

constants/

types/


---

# Routing Structure (Expo Router)

The application uses **Expo Router file-based routing**.


app/

index.tsx

(auth)/
login.tsx
register.tsx

(tabs)/
home.tsx
missions.tsx
map.tsx
profile.tsx

missions/
[id].tsx
accept.tsx

organizer/
create-mission.tsx
mission-detail.tsx
volunteers.tsx


---

# Core Modules

## Auth Module

Handles authentication and user registration.

Features:

- Login
- Register
- Token storage
- Session persistence
- Role detection (organizer / volunteer)

Components:

- LoginForm
- RegisterForm

Services:

- authService.ts

---

## Missions Module

Central feature of the application.

Features:

For Volunteers:

- View available missions
- Accept missions
- Track mission status

For Organizers:

- Create missions
- View mission volunteers
- Track mission progress

UI examples:

- MissionCard
- MissionDetailScreen
- AcceptMissionButton

---

## Map Module

Handles geolocation and visualization of missions on the map.

Uses:

- react-native-maps
- OpenStreetMap tiles

Features:

- Display nearby missions
- Mission markers
- User location
- Navigation preview

Example:

Volunteer sees:

📍 Missions near you

---

## Volunteers Module

Allows organizers to manage volunteers assigned to missions.

Features:

- View volunteers list
- Track volunteer status
- Accept / reject volunteer requests

Components:

- VolunteerCard
- VolunteerList

---

## Profile Module

User profile management.

Features:

- Edit profile
- View participation history
- View missions created (organizers)

---

## Notifications Module

Handles app notifications.

Features:

- Mission accepted
- New mission available
- Mission updates

---

# UI System

The UI layer uses **Tamagui** for main components.

Use Tamagui components for:

- Buttons
- Cards
- Inputs
- Modals
- Layout containers
- Screen sections

Example components:

- Button
- Card
- Input
- Dialog

Prefer **reusable UI components** inside:


components/ui/


---

# Styling System

The project uses **NativeWind** for rapid styling.

Example:

```tsx
<View className="flex-1 bg-white p-4">

NativeWind is used for:

spacing

colors

flexbox

layout

responsive design

Avoid using large StyleSheet blocks when NativeWind is sufficient.

Animations

Animations use React Native Reanimated.

Use it for:

screen transitions

list animations

card appearance

gesture interactions

Example cases:

Mission cards appearing

Modal transitions

Scroll-based animations

Lottie Animations

Use Lottie for visual UX feedback.

Examples:

Mission accepted confirmation

Loading states

Empty state screens

Onboarding

Example screens:

✔ Mission accepted animation

Maps

Maps are implemented with:

react-native-maps

OpenStreetMap tiles

Features:

Mission markers

User location

Mission clustering (future)

Map-based mission discovery

Example UI:

Volunteer opens map and sees:

📍 Nearby missions.

Icons

Icons use Expo Vector Icons.

Use icons for:

Navigation:

🏠 Home
📍 Missions
🗺 Map
👤 Profile

Buttons:

➕ Create mission
✔ Accept mission

API Communication

All API calls should go through the services/api layer.

Example:

services/api/missions.ts
services/api/auth.ts

Use a centralized HTTP client.

Example responsibilities:

attach JWT token

handle errors

base URL configuration

State Management

Local state:

React hooks

Shared state:

lightweight store or context

Examples:

Auth state

User role

Current mission

Component Design Guidelines

Prefer:

small reusable components

feature-based components

separation between UI and logic

Example structure:

modules/missions/

  components/
      MissionCard.tsx
      MissionList.tsx

  screens/
      MissionsScreen.tsx
      MissionDetailScreen.tsx

  services/
      missionsService.ts
Code Style

Always:

Use TypeScript

Use functional components

Use hooks

Keep components small and composable

Naming conventions:

Components:

MissionCard.tsx
VolunteerList.tsx

Hooks:

useAuth.ts
useMissions.ts

Services:

missionsService.ts
Future Features

Potential expansions:

Real-time mission tracking

Push notifications

Route optimization

Volunteer reputation system

Offline mission access



## Backend 

Estado General

Stack: NestJS + TypeORM + PostgreSQL + class-validator + EventEmitter.
Prefijo global API: api/v1 en main.ts.
CORS habilitado globalmente.
Validación global activa (whitelist, forbidNonWhitelisted, transform).
Configuración global en app.module.ts con:
ConfigModule (env validation)
TypeOrmModule async
EventEmitterModule
Estructura Actual

users implementado.
events implementado.
campaigns implementado.
donations implementado.
logistics implementado.
auth scaffold básico (sin lógica real aún).
chat scaffold básico (sin WebSocket aún).
Eventos de dominio definidos en src/events/*.

Módulos Listos Para Consumir Desde Front

1) Users
Controlador: users.controller.ts
Rutas base: /api/v1/users

Endpoints:

POST /users
GET /users
GET /users/:id
PATCH /users/:id
DELETE /users/:id (204)
DTO/shape:

Role enum: organizer | volunteer | donor (user.entity.ts)
Listado paginado retorna:
data: UserResponseDto[]
meta: { total, page, limit, totalPages }
(user-response.dto.ts)
2) Events
Controlador: events.controller.ts
Rutas base: /api/v1/events

Endpoints:

POST /events
GET /events
GET /events/:id
PATCH /events/:id
DELETE /events/:id (204)

Campos importantes:

name, disasterType, city, description, date, createdBy
Listado con paginación + filtros (city, disasterType, search).
Evento emitido:

event.created (event-created.event.ts).
3) Campaigns
Controlador: campaigns.controller.ts
Rutas base: /api/v1/campaigns

Endpoints:

POST /campaigns
GET /campaigns
GET /campaigns/event/:eventId
GET /campaigns/:id
PATCH /campaigns/:id
DELETE /campaigns/:id (204)
Campos:

name, description, campaignType, goalMoney, eventId, createdBy
campaignType enum: money | physical_items | mixed
Response incluye collectedMoney.

Eventos:

Emite campaign.created.
Escucha donation.created y actualiza collectedMoney automáticamente (campaigns.service.ts).
4) Donations
Controlador: donations.controller.ts
Rutas base: /api/v1/donations

Monetarias:

POST /donations/money
GET /donations/money
GET /donations/money/:id
Ítems:

POST /donations/items
GET /donations/items
GET /donations/items/:id
PATCH /donations/items/:id/status
Enums:

DonationItemStatus:
pending
delivered_to_pickup_point
assigned_to_shipment
delivered
(donation-item.entity.ts)

Eventos:

Emite donation.created en donación monetaria.
Emite donation.item.received cuando item pasa a delivered_to_pickup_point.
5) Logistics
Controlador: logistics.controller.ts
Rutas base: /api/v1/logistics

Pickup points:

POST /logistics/pickup-points
GET /logistics/pickup-points
GET /logistics/pickup-points/:id
PATCH /logistics/pickup-points/:id
Shipments:

POST /logistics/shipments
GET /logistics/shipments
GET /logistics/shipments/:id
PATCH /logistics/shipments/:id/assign-volunteer
PATCH /logistics/shipments/:id/status
Enums:

ShipmentStatus:
pending
assigned
in_transit
delivered
(shipment.entity.ts)

Eventos:

Emite shipment.assigned.
Emite shipment.delivered.
Módulos Aún No Funcionales Para Front

auth (auth.controller.ts): sin login/jwt real todavía.
chat (chat.controller.ts): aún sin gateway WebSocket implementado.
Convenciones de Respuesta Útiles para Front

Muchos listados ya vienen como paginados:
data + meta (total, page, limit, totalPages).
Errores usan excepciones Nest (404, 409, etc.) en formato estándar JSON de Nest.
IDs esperados como numéricos (ParseIntPipe).