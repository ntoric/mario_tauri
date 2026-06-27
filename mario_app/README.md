# Mario App - Self-Sufficient Flutter Application

A complete Flutter Android application for restaurant management with **built-in backend logic** and direct PostgreSQL database connectivity. No separate backend server required!

## Architecture

This app uses a unique self-sufficient architecture:

```
┌─────────────────────────────────────────────┐
│           Mario App (Flutter)                │
│  ┌─────────────────────────────────────┐   │
│  │      UI Layer (Screens/Widgets)     │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │      Providers (State Management)     │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │      Backend Layer (Built-in)       │   │
│  │  • Auth Backend (JWT, bcrypt)       │   │
│  │  • Business Logic (Orders, Bills)  │   │
│  │  • Database Service (PostgreSQL)   │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │      PostgreSQL Driver              │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                    │
                    │ Direct Connection
                    ▼
          ┌──────────────────┐
          │  Remote PostgreSQL │
          │     Database       │
          └──────────────────┘
```

## Features

### Authentication & Security
- **JWT Token Authentication** - Implemented locally in Flutter
- **Password Hashing** - bcrypt-like hashing algorithm
- **Role-Based Access Control** - Superadmin, Business Owner, Business Admin, Staff
- **Secure Token Storage** - Using flutter_secure_storage
- **Session Management** - 24-hour token expiration

### Database
- **Direct PostgreSQL Connection** - No API middleman
- **Automatic Schema Creation** - Tables created on first connect
- **Transaction Support** - ACID compliance for critical operations
- **Connection Pooling** - Efficient database connections

### Table Management
- Visual grid of all tables with occupancy status
- Color-coded cards (orange for occupied, gray for available)
- Real-time order totals on table cards
- Quick actions: Create Order, Edit Order, Generate Bill, Move Table, Cancel Order

### Order Management
- Create/edit orders with item selection
- Category filtering and search
- Quantity management (add/remove/delete items)
- Real-time subtotal, tax, and total calculation
- Move order to different table functionality

### Billing
- Generate bills with auto-incrementing invoice numbers
- Multiple payment methods (Cash, Card, UPI)
- Customer name capture
- Complete order on bill generation

### Statistics & Reports (Business Owner Only)
- Total revenue overview
- Order statistics (active, completed, cancelled)
- Payment method breakdown with progress bars
- System statistics (users, stores, items, tables, bills)
- Recent bills list

### Responsive Design
- Bottom navigation for mobile
- Navigation rail for tablets/desktop
- Adaptive grid layouts (2-6 columns based on screen width)
- Side-by-side layouts on tablets

## Color Scheme

- **Primary**: #FF6B35 (Orange)
- **Primary Dark**: #E55A2B
- **Secondary**: #2D3748 (Dark Gray)
- **Background**: #F7FAFC (Light Gray)
- **Success**: #48BB78 (Green)
- **Warning**: #ED8936 (Orange)
- **Danger**: #F56565 (Red)
- **Info**: #4299E1 (Blue)

## Getting Started

### Prerequisites
- Flutter SDK (>=3.0.0)
- Android Studio or VS Code with Flutter extension
- Android SDK
- PostgreSQL database (local or remote)

### Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE mario_db;
```

2. The app will automatically create all required tables on first connection.

3. Default superadmin credentials:
   - Username: `superadmin`
   - Password: (set during first setup or configured in database)

### Installation

1. Navigate to the project directory:
```bash
cd mario_app
```

2. Install dependencies:
```bash
flutter pub get
```

3. Run the app:
```bash
flutter run
```

### First Time Setup

1. On first launch, you'll see the **Database Configuration** screen
2. Enter your PostgreSQL connection details:
   - **Host**: Your database host (e.g., `localhost`, `192.168.1.100`, or remote host)
   - **Port**: PostgreSQL port (default: `5432`)
   - **Database**: Database name (e.g., `mario_db`)
   - **Username**: PostgreSQL username
   - **Password**: PostgreSQL password
   - **Use SSL**: Enable if your database requires SSL
3. Tap "Connect to Database"
4. The app will create all necessary tables automatically
5. Login with your credentials

### Building for Release

```bash
flutter build apk --release
```

The APK will be generated at `build/app/outputs/flutter-apk/app-release.apk`

## Project Structure

```
lib/
├── backend/                  # Built-in Backend Layer
│   ├── backend_service.dart  # Main backend coordinator
│   ├── database_service.dart # PostgreSQL connection
│   ├── auth_backend.dart     # Authentication & JWT
│   ├── stores_backend.dart   # Store management logic
│   ├── tables_backend.dart   # Table management logic
│   ├── categories_backend.dart
│   ├── items_backend.dart
│   ├── orders_backend.dart   # Order processing logic
│   ├── bills_backend.dart    # Billing logic
│   └── system_backend.dart   # Statistics & system operations
├── models/                   # Data models
├── providers/                # State management
├── screens/                  # UI screens
├── services/                 # (Legacy - now in backend)
└── utils/                    # Utilities
```

## Backend Implementation Details

### Authentication (JWT)
The app implements JWT authentication locally:
- Token generation with HMAC-SHA256 signing
- 24-hour expiration
- Payload contains user ID, username, role, store ID
- Secure storage using flutter_secure_storage

### Password Hashing
Custom bcrypt-like implementation:
- Salt generation using cryptographically secure random
- SHA-256 hashing with salt
- Format: `$2a$10$<salt>$<hash>`

### Database Operations
Direct PostgreSQL operations using the `postgres` package:
- Connection pooling
- Transaction support with BEGIN/COMMIT/ROLLBACK
- Parameterized queries for SQL injection prevention
- Automatic schema initialization

### Business Logic
All business rules implemented in Flutter:
- Order total calculations
- Tax computations
- Invoice number generation
- Role-based permissions
- Store switching logic

## Database Schema

The app automatically creates these tables:

- **users** - User accounts and authentication
- **stores** - Restaurant/store information
- **user_stores** - Many-to-many user-store relationships
- **categories** - Item categories
- **items** - Menu items with pricing
- **tables** - Restaurant tables
- **orders** - Order headers
- **order_items** - Order line items
- **bills** - Generated bills/invoices

## Security Considerations

⚠️ **Important**: This architecture has specific security implications:

1. **Database Credentials**: Stored securely on device but required for direct connection
2. **Network Security**: Use SSL for remote database connections
3. **User Permissions**: Database user should have minimal required permissions
4. **No Middleman**: Direct DB connection means no API layer for additional security controls

### Recommended Security Practices

1. Use a dedicated database user with limited permissions
2. Enable SSL for all remote connections
3. Use VPN or private network for database access
4. Implement IP whitelisting on database server
5. Regular security audits

## User Roles

1. **Superadmin**: Full system access, statistics, system reset
2. **Business Owner**: Store management, user management, statistics
3. **Business Admin**: Store-specific management, staff management
4. **Staff**: Order management, billing

## Dependencies

### Core
- `postgres`: PostgreSQL database driver
- `crypto`: Cryptographic functions (SHA, HMAC)
- `uuid`: UUID generation

### State Management
- `provider`: State management
- `shared_preferences`: Local settings storage
- `flutter_secure_storage`: Secure token storage

### UI
- `intl`: Date/number formatting
- `fl_chart`: Charts for statistics
- `flutter_screenutil`: Responsive sizing
- `google_fonts`: Typography

## Advantages of This Architecture

1. **No Backend Server Required** - Reduces infrastructure costs
2. **Lower Latency** - Direct database connection
3. **Offline-First Potential** - Can be extended with local caching
4. **Simpler Deployment** - Just the mobile app
5. **Real-time Updates** - Direct DB connection means immediate data visibility

## Limitations

1. **Security** - Database credentials on device
2. **Scalability** - Limited by direct DB connections
3. **Complexity** - Business logic in mobile app
4. **Updates** - App updates required for backend changes

## License

This project is part of the Mario Restaurant Management System.