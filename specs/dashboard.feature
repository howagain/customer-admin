Feature: Customer Management Dashboard

  # --- Authentication ---

  Scenario: Owner accesses dashboard
    Given the owner navigates to the dashboard URL
    When they authenticate with the owner token
    Then they see the customer list view

  Scenario: Unauthenticated access is blocked
    Given a random person navigates to the dashboard URL
    When they have no valid token
    Then they see a login/auth prompt
    And no customer data is exposed

  # --- Customer List ---

  Scenario: Dashboard shows all customers
    Given the config has channels "#client-bob" and "#client-jane" in the allowlist
    When the owner views the customer list
    Then they see "Bob" with status "Active"
    And they see "Jane" with status "Active"
    And each row shows channel name, status, and system prompt preview

  Scenario: Empty state
    Given the config has no customer channels
    When the owner views the customer list
    Then they see "No customers yet" with an "Add Customer" button

  Scenario: Paused customer shows correct status
    Given "#client-mike" has enabled: false in the config
    When the owner views the customer list
    Then "Mike" shows status "Paused"

  # --- Add Customer ---

  Scenario: Owner adds a new customer
    Given the owner clicks "Add Customer"
    When they enter channel name "client-acme"
    And they enter system prompt "You are Acme Corp's blog assistant"
    And they click "Save"
    Then the config is patched with a new "#client-acme" channel entry
    And the gateway restarts
    And the customer list shows "Acme" as "Active"

  Scenario: Adding a customer with duplicate channel fails
    Given "#client-bob" already exists in the config
    When the owner tries to add channel "client-bob"
    Then they see an error "Channel already exists"
    And no config change is made

  Scenario: Channel name is validated
    When the owner enters channel name ""
    Then the "Save" button is disabled
    And they see "Channel name is required"

  # --- Edit Customer ---

  Scenario: Owner edits a customer's system prompt
    Given "#client-bob" exists with prompt "Blog assistant"
    When the owner opens Bob's detail view
    And changes the system prompt to "Blog and social media assistant"
    And clicks "Save"
    Then the config is patched with the new system prompt
    And the gateway restarts

  Scenario: Owner pauses a customer
    Given "#client-bob" is active
    When the owner clicks "Pause" on Bob
    Then the config is patched with enabled: false
    And the gateway restarts
    And Bob's status shows "Paused"

  Scenario: Owner reactivates a customer
    Given "#client-bob" is paused (enabled: false)
    When the owner clicks "Activate" on Bob
    Then the config is patched with enabled: true
    And the gateway restarts
    And Bob's status shows "Active"

  # --- Remove Customer ---

  Scenario: Owner removes a customer
    Given "#client-bob" exists in the config
    When the owner clicks "Remove" on Bob
    Then they see a confirmation dialog "Remove Bob? The bot will stop responding in #client-bob"
    When they confirm
    Then "#client-bob" is removed from the config
    And the gateway restarts
    And Bob no longer appears in the customer list

  Scenario: Remove requires confirmation
    Given "#client-bob" exists
    When the owner clicks "Remove" on Bob
    And they cancel the confirmation
    Then no config change is made
    And Bob remains in the list

  # --- Config Integrity ---

  Scenario: Dashboard preserves existing config
    Given the config has groupPolicy "allowlist" and dm settings and other channels
    When the owner adds "#client-new"
    Then only the channels section is patched
    And groupPolicy remains "allowlist"
    And dm settings are unchanged
    And all other config keys are preserved

  Scenario: Gateway restart is confirmed
    When any config change is saved
    Then the dashboard shows "Restarting gateway..."
    And after restart completes, shows "Gateway restarted ✓"
    And if restart fails, shows the error

  # --- Mobile ---

  Scenario: Dashboard works on mobile
    Given the owner opens the dashboard on a phone browser
    Then the layout is responsive
    And all actions (add, edit, pause, remove) are accessible
    And buttons are tap-friendly (min 44px touch targets)

  # --- Paywall ---

  Scenario: Unpaid customer gets paywall message
    Given "#client-acme" has paid: false in the config
    When a user sends a message in #client-acme
    Then the bot responds with a polite paywall message
    And does not process the request

  Scenario: Paid customer gets normal responses
    Given "#client-acme" has paid: true in the config
    When a user sends a message in #client-acme
    Then the bot processes and responds normally
