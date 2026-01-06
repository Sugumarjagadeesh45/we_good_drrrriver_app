# EazyGo Driver App: Fare Calculation & Billing Logic

This document outlines the strict rules for fare calculation and display in the EazyGo Driver App. The backend AI and server implementation must adhere to this logic to ensure consistency.

## 1. Pre-Ride Fare Display (Before Acceptance)

This is the fare estimate shown to the driver when a new ride request appears.

-   **Responsibility:** Backend
-   **Trigger:** When a user books a ride.
-   **Endpoint (Example):** `POST /api/rides/book`
-   **Logic:** The backend calculates an **estimated fare** based on the route distance, vehicle type, and any applicable base fares or surge pricing.
-   **Payload Requirement:** The `newRideRequest` socket event and the FCM notification payload sent to the driver **must** include a `fare` field.
    ```json
    {
      "rideId": "RID12345",
      "userName": "John Doe",
      "pickup": { "..."},
      "drop": { "..."},
      "vehicleType": "taxi",
      "fare": 95.50
    }
    ```
-   **Driver App Behavior:** The driver app will display this `fare` value **exactly as received**. It is treated as an estimate only.

## 2. Dynamic Fare Calculation (After OTP Verification)

This is the live, dynamic fare calculation that happens during the ride.

-   **Responsibility:** Driver App
-   **Trigger:** When the driver successfully verifies the passenger's OTP.
-   **Start Location:** The driver's precise GPS location at the moment of OTP verification is recorded as `otpVerificationLocation`.
-   **Distance Calculation:** The driver app continuously calculates the Haversine distance from `otpVerificationLocation` to the driver's current live GPS location. This is the `actualDistanceTravelled`.

## 3. Final Billing (On Ride Completion)

This is the final, non-negotiable fare calculation.

-   **Responsibility:** Driver App (Calculation) & Backend (Verification & Record)
-   **Trigger:** When the driver presses the "Complete Ride" button.
-   **Driver App Logic:**
    1.  Get the total `actualDistanceTravelled` (in km) since OTP verification.
    2.  Fetch the admin-configured price per kilometer for the ride's `vehicleType`.
    3.  **Final Fare = `actualDistanceTravelled` × `price_per_km`**
-   **Endpoint (Example):** `socket.emit('driverCompletedRide', payload)`
-   **Driver App Payload:** The driver app sends the final calculated data to the server.
    ```json
    {
      "rideId": "RID12345",
      "driverId": "dri10001",
      "finalDistance": 8.75, // Total km travelled
      "finalFare": 131.25   // Final calculated fare (8.75km * 15/km)
    }
    ```
-   **Backend Responsibility:**
    -   **Verification (Highly Recommended):** The backend should re-calculate the fare using the `finalDistance` from the payload and its own stored `price_per_km` to prevent tampering.
    -   **Single Source of Truth:** The backend's verified fare is the final amount to be charged to the user and recorded for driver payment.
    -   **Update Database:** Store `finalDistance` and `finalFare` in the ride's database record.

## 4. Strict Fare Rules (No Extra Charges)

-   The final fare **must only** be `distance × price_per_km`.
-   The system **must not** add any convenience fees, platform fees, taxes, or other charges on the driver's side. All such adjustments are the backend's responsibility.
-   If the `actualDistanceTravelled` is 0, the `finalFare` must be 0.