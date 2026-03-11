import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";

actor {
  type Progress = {
    checkpoint : Nat;
    completed : Bool;
  };

  let progressMap = Map.empty<Principal, Progress>();

  public shared ({ caller }) func saveProgress(checkpoint : Nat) : async () {
    let currentProgress = switch (progressMap.get(caller)) {
      case (null) { { checkpoint = 0; completed = false } };
      case (?progress) { progress };
    };

    if (checkpoint <= currentProgress.checkpoint) {
      Runtime.trap("You can only save progress at a higher checkpoint");
    };

    progressMap.add(
      caller,
      {
        checkpoint;
        completed = currentProgress.completed;
      },
    );
  };

  public shared ({ caller }) func completeCourse() : async () {
    let currentProgress = switch (progressMap.get(caller)) {
      case (null) { { checkpoint = 0; completed = false } };
      case (?progress) { progress };
    };

    if (currentProgress.completed) {
      Runtime.trap("Course already completed");
    };

    progressMap.add(
      caller,
      {
        checkpoint = currentProgress.checkpoint;
        completed = true;
      },
    );
  };

  public shared ({ caller }) func resetProgress() : async () {
    switch (progressMap.get(caller)) {
      case (null) { Runtime.trap("No progress to reset") };
      case (?_) {
        progressMap.add(caller, { checkpoint = 0; completed = false });
      };
    };
  };

  public query ({ caller }) func getProgress() : async Progress {
    switch (progressMap.get(caller)) {
      case (null) { { checkpoint = 0; completed = false } };
      case (?progress) { progress };
    };
  };
};
