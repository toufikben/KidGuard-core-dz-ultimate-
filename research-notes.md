# Research notes — KidGuard product roadmap

## Google Play Families Policy
Source: https://support.google.com/googleplay/android-developer/answer/9893335?hl=en

- Apps in the Families program must protect children's privacy and comply with applicable laws.
- Apps must have a privacy policy accurately reflecting data collection and handling.
- The policy page includes dedicated sections for precise location, personal and sensitive information, data practices, neutral age screen, and COPPA/GDPR considerations.
- Search result summary for the official policy states that apps solely targeting children may not request location permission or collect/use/transmit precise location; this must be checked against the current full policy and target-audience declaration before release.

## Android background location
Source: https://developer.android.com/develop/sensors-and-location/location/background

- Request only the location permission critical to the user-facing feature and disclose it clearly.
- Background location must be critical to the app's core functionality, offer clear user benefit, and be obvious to the user.
- Google Play restricts background location access to apps that need it for core functionality and satisfy related policy requirements; following best practices does not guarantee approval.
- Android documentation points developers toward geofencing as an appropriate mechanism for location-triggered behavior, instead of unrestricted continuous background tracking where possible.

## Sensitive permissions and APIs
Source: https://support.google.com/googleplay/android-developer/answer/16558241?hl=en-GB

- Sensitive permissions and APIs must be necessary for core functionality promoted in the Play listing and limited to user-consented purposes.
- Request permissions incrementally and explain each level in context; respect a user's refusal and provide alternatives where possible.
- The page notes upcoming policy changes effective 27 January 2027, including more restrictive location-permission expectations; release planning should re-check policy immediately before submission.

## NCMEC Child Safety Toolkit
Source: https://www.missingkids.org/education/childsafetytoolkit

- NCMEC frames child safety as both online and offline, not only location tracking.
- The toolkit provides age-appropriate prevention resources, parent-child discussion guides, checklists, personal-boundary education, and prevention of abduction materials.
- Product implication: add an optional, age-appropriate safety education and family check-in layer; it should empower children without frightening them and should not expose child location publicly.
