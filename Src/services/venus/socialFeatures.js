// Social Features Service
// Feed generation, friend management, challenges

const SocialPost = require('../../models/venus/SocialPost');
const Challenge = require('../../models/venus/Challenge');
const Workout = require('../../models/venus/Workout');

/**
 * Generate personalized social feed
 */
exports.getFeed = async (userId, page = 1, filter = 'all') => {
  try {
    const limit = 20;
    const skip = (page - 1) * limit;

    // In production, this would include friend IDs and following lists
    // For now, get public posts with engagement
    let query = {
      visibility: { $in: ['public', 'friends'] }
    };

    if (filter === 'friends') {
      // Would filter by friend IDs
      // query.userId = { $in: friendIds };
    }

    const posts = await SocialPost.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name profilePicture')
      .populate('content.workoutId')
      .populate({
        path: 'comments.userId',
        select: 'name profilePicture'
      });

    const total = await SocialPost.countDocuments(query);

    // Add context like "user has liked", "user has commented"
    const enrichedPosts = posts.map(post => {
      const postObj = post.toObject();
      postObj.hasLiked = post.likes.some(like => 
        like.userId.toString() === userId.toString()
      );
      postObj.hasCommented = post.comments.some(comment => 
        comment.userId._id.toString() === userId.toString()
      );
      return postObj;
    });

    return {
      posts: enrichedPosts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total,
        hasMore: skip + posts.length < total
      }
    };

  } catch (error) {
    console.error('Feed generation error:', error);
    throw error;
  }
};

/**
 * Get trending posts
 */
exports.getTrendingPosts = async (timeframe = 24, limit = 20) => {
  try {
    const since = new Date();
    since.setHours(since.getHours() - timeframe);

    const trending = await SocialPost.find({
      visibility: 'public',
      createdAt: { $gte: since }
    })
      .sort({ 
        'engagement.likeCount': -1, 
        'engagement.commentCount': -1,
        'engagement.views': -1
      })
      .limit(limit)
      .populate('userId', 'name profilePicture')
      .populate('content.workoutId');

    return trending;

  } catch (error) {
    console.error('Trending posts error:', error);
    throw error;
  }
};

/**
 * Share workout to social feed
 */
exports.shareWorkout = async (userId, workoutId, caption, visibility = 'friends') => {
  try {
    const workout = await Workout.findOne({ _id: workoutId, userId })
      .populate('exercises.exerciseId');

    if (!workout) {
      throw new Error('Workout not found');
    }

    // Calculate stats
    const totalVolume = workout.exercises.reduce((sum, ex) => {
      return sum + ex.sets.reduce((setSum, set) => {
        return setSum + (set.weight || 0) * (set.reps || 0);
      }, 0);
    }, 0);

    const post = await SocialPost.create({
      userId,
      postType: 'workout',
      content: {
        workoutId,
        stats: {
          duration: workout.duration,
          volume: totalVolume,
          exercises: workout.exercises.length,
          calories: workout.caloriesBurned
        }
      },
      caption,
      visibility
    });

    await post.populate('userId', 'name profilePicture');

    return post;

  } catch (error) {
    console.error('Share workout error:', error);
    throw error;
  }
};

/**
 * Get challenges for user
 */
exports.getChallenges = async (userId) => {
  try {
    const active = await Challenge.find({
      'participants.userId': userId,
      status: 'active'
    })
      .populate('createdBy', 'name profilePicture')
      .sort({ 'duration.startDate': -1 });

    const available = await Challenge.find({
      status: { $in: ['upcoming', 'active'] },
      visibility: { $in: ['public', 'invite-only'] },
      'participants.userId': { $ne: userId }
    })
      .populate('createdBy', 'name profilePicture')
      .sort({ 'duration.startDate': 1 })
      .limit(10);

    const completed = await Challenge.find({
      'participants.userId': userId,
      status: 'completed'
    })
      .populate('createdBy', 'name profilePicture')
      .sort({ 'duration.endDate': -1 })
      .limit(5);

    return {
      active,
      available,
      completed
    };

  } catch (error) {
    console.error('Get challenges error:', error);
    throw error;
  }
};

/**
 * Join a challenge
 */
exports.joinChallenge = async (userId, challengeId) => {
  try {
    const challenge = await Challenge.findById(challengeId);

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    await challenge.addParticipant(userId);
    await challenge.populate('createdBy', 'name profilePicture');

    const leaderboard = challenge.getLeaderboard();

    return {
      challenge,
      leaderboard,
      message: 'Successfully joined challenge'
    };

  } catch (error) {
    console.error('Join challenge error:', error);
    throw error;
  }
};

/**
 * Update challenge progress
 */
exports.updateChallengeProgress = async (userId, challengeId, currentValue) => {
  try {
    const challenge = await Challenge.findById(challengeId);

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    await challenge.updateProgress(userId, currentValue);
    const leaderboard = challenge.getLeaderboard();

    // Find user's position
    const userPosition = leaderboard.findIndex(p => 
      p.userId.toString() === userId.toString()
    );

    return {
      progress: challenge.participants.find(p => 
        p.userId.toString() === userId.toString()
      ).progress,
      rank: userPosition + 1,
      leaderboard: leaderboard.slice(0, 10), // Top 10
      message: 'Progress updated'
    };

  } catch (error) {
    console.error('Update challenge progress error:', error);
    throw error;
  }
};

/**
 * Get leaderboard for challenge
 */
exports.getChallengeLeaderboard = async (challengeId) => {
  try {
    const challenge = await Challenge.findById(challengeId)
      .populate('participants.userId', 'name profilePicture');

    if (!challenge) {
      throw new Error('Challenge not found');
    }

    const leaderboard = challenge.getLeaderboard();

    return {
      challenge: {
        name: challenge.name,
        type: challenge.type,
        goal: challenge.goal,
        endDate: challenge.duration.endDate
      },
      leaderboard,
      totalParticipants: challenge.participantCount
    };

  } catch (error) {
    console.error('Get leaderboard error:', error);
    throw error;
  }
};

/**
 * Get friend management (placeholder - needs Friend model)
 */
exports.getFriends = async (userId) => {
  try {
    // In production, this would query a Friends model
    // For now, return mock structure
    return {
      friends: [],
      requests: {
        received: [],
        sent: []
      },
      suggestions: []
    };

  } catch (error) {
    console.error('Get friends error:', error);
    throw error;
  }
};

/**
 * Send friend request (placeholder)
 */
exports.sendFriendRequest = async (fromUserId, toUserId) => {
  try {
    // Would create FriendRequest document
    return {
      success: true,
      message: 'Friend request sent'
    };

  } catch (error) {
    console.error('Send friend request error:', error);
    throw error;
  }
};

/**
 * Get user's social stats
 */
exports.getUserSocialStats = async (userId) => {
  try {
    const totalPosts = await SocialPost.countDocuments({ userId });
    
    const posts = await SocialPost.find({ userId });
    const totalLikes = posts.reduce((sum, post) => sum + post.engagement.likeCount, 0);
    const totalComments = posts.reduce((sum, post) => sum + post.engagement.commentCount, 0);

    const activeChallenges = await Challenge.countDocuments({
      'participants.userId': userId,
      status: 'active'
    });

    const completedChallenges = await Challenge.countDocuments({
      'participants.userId': userId,
      status: 'completed'
    });

    return {
      posts: totalPosts,
      likes: totalLikes,
      comments: totalComments,
      challenges: {
        active: activeChallenges,
        completed: completedChallenges
      },
      followers: 0, // Would need followers model
      following: 0  // Would need following model
    };

  } catch (error) {
    console.error('Get social stats error:', error);
    throw error;
  }
};

/**
 * Get activity feed (recent activity from friends)
 */
exports.getActivityFeed = async (userId, limit = 50) => {
  try {
    // Would filter by friend IDs in production
    const activities = await SocialPost.find({
      visibility: { $in: ['public', 'friends'] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'name profilePicture')
      .select('userId postType createdAt caption engagement');

    return activities;

  } catch (error) {
    console.error('Get activity feed error:', error);
    throw error;
  }
};

module.exports = exports;
